import { ProviderHealthRecord } from '../realDataProviders';

export interface ProviderUsageStats {
  requestsToday: number;
  requestsThisHour: number;
  cacheHits: number;
  cacheMisses: number;
  deduplicatedRequests: number;
  failedRequests: number;
  estimatedComputeUnitsUsed: number | null;
  lastRequestAt: string | null;
  usageMode: 'NORMAL' | 'CONSERVATION' | 'CRITICAL';
}

interface CachedValue<T> {
  value: T;
  fetchedAt: number;
  expiresAt: number;
}

export class BirdeyeProvider {
  private static usage: ProviderUsageStats = {
    requestsToday: 0,
    requestsThisHour: 0,
    cacheHits: 0,
    cacheMisses: 0,
    deduplicatedRequests: 0,
    failedRequests: 0,
    estimatedComputeUnitsUsed: null, // Don't invent CU values if not explicitly provided
    lastRequestAt: null,
    usageMode: 'NORMAL'
  };

  private static hourlyResetTimestamp = Date.now() + 3600000;
  private static dailyResetTimestamp = Date.now() + 86400000;

  private static cache = new Map<string, CachedValue<unknown>>();
  private static inFlight = new Map<string, Promise<unknown>>();

  private static readonly CONFIG = {
    MAX_REQUESTS_PER_HOUR: parseInt(process.env.BIRDEYE_MAX_REQUESTS_PER_HOUR || '300'),
    MAX_REQUESTS_PER_DAY: parseInt(process.env.BIRDEYE_MAX_REQUESTS_PER_DAY || '3000'),
    MAX_CONCURRENT_REQUESTS: parseInt(process.env.BIRDEYE_MAX_CONCURRENT_REQUESTS || '2'),
    MIN_REQUEST_INTERVAL_MS: parseInt(process.env.BIRDEYE_MIN_REQUEST_INTERVAL_MS || '250'),
  };

  private static activeRequests = 0;
  private static requestQueue: Array<() => void> = [];
  private static lastNetworkRequestAt = 0;

  // Track if we're currently in a 429 backoff
  private static rateLimitUntil = 0;

  public static getUsageStats(): ProviderUsageStats {
    this.updateUsageMode();
    return { ...this.usage };
  }

  private static updateUsageMode() {
    const now = Date.now();
    if (now >= this.hourlyResetTimestamp) {
      this.usage.requestsThisHour = 0;
      this.hourlyResetTimestamp = now + 3600000;
    }
    if (now >= this.dailyResetTimestamp) {
      this.usage.requestsToday = 0;
      this.dailyResetTimestamp = now + 86400000;
    }

    const hourlyPct = this.usage.requestsThisHour / this.CONFIG.MAX_REQUESTS_PER_HOUR;
    const dailyPct = this.usage.requestsToday / this.CONFIG.MAX_REQUESTS_PER_DAY;
    const maxPct = Math.max(hourlyPct, dailyPct);

    if (maxPct > 0.9) {
      this.usage.usageMode = 'CRITICAL';
    } else if (maxPct > 0.7) {
      this.usage.usageMode = 'CONSERVATION';
    } else {
      this.usage.usageMode = 'NORMAL';
    }
  }

  private static getTTL(baseTTLMs: number, isCritical: boolean = false): number {
    this.updateUsageMode();
    if (isCritical) {
      // For critical data (e.g., price fallback), keep TTL normal or shorter
      return baseTTLMs;
    }

    // Adjust TTL based on usage mode to conserve budget
    if (this.usage.usageMode === 'CRITICAL') {
      return baseTTLMs * 4; // Extend TTL significantly
    } else if (this.usage.usageMode === 'CONSERVATION') {
      return baseTTLMs * 2; // Double TTL
    }
    return baseTTLMs;
  }

  private static async acquireToken(): Promise<void> {
    if (Date.now() < this.rateLimitUntil) {
      const waitTime = this.rateLimitUntil - Date.now();
      await new Promise(r => setTimeout(r, waitTime));
    }

    return new Promise((resolve) => {
      const tryExecute = () => {
        const now = Date.now();
        const timeSinceLast = now - this.lastNetworkRequestAt;

        if (this.activeRequests < this.CONFIG.MAX_CONCURRENT_REQUESTS && timeSinceLast >= this.CONFIG.MIN_REQUEST_INTERVAL_MS) {
          this.activeRequests++;
          this.lastNetworkRequestAt = Date.now();
          resolve();
        } else {
          let waitMs = 50;
          if (timeSinceLast < this.CONFIG.MIN_REQUEST_INTERVAL_MS) {
             waitMs = this.CONFIG.MIN_REQUEST_INTERVAL_MS - timeSinceLast;
          }
          setTimeout(() => {
             // Re-evaluate queue
             if (this.requestQueue.length > 0 && this.requestQueue[0] === tryExecute) {
                if (this.activeRequests < this.CONFIG.MAX_CONCURRENT_REQUESTS) {
                   this.requestQueue.shift();
                   this.activeRequests++;
                   this.lastNetworkRequestAt = Date.now();
                   resolve();
                } else {
                   this.requestQueue.push(this.requestQueue.shift()!); // Requeue
                }
             }
          }, waitMs);
        }
      };

      if (this.activeRequests < this.CONFIG.MAX_CONCURRENT_REQUESTS && (Date.now() - this.lastNetworkRequestAt) >= this.CONFIG.MIN_REQUEST_INTERVAL_MS) {
         this.activeRequests++;
         this.lastNetworkRequestAt = Date.now();
         resolve();
      } else {
         this.requestQueue.push(tryExecute);
         if (this.requestQueue.length === 1) {
            setTimeout(tryExecute, 50);
         }
      }
    });
  }

  private static releaseToken() {
    this.activeRequests--;
    // The setInterval/setTimeout in acquireToken will naturally pick up the next
  }

  private static async request<T>(path: string, cacheKey: string, baseTTLMs: number, isCritical: boolean = false): Promise<T | null> {
    const apiKey = process.env.BIRDEYE_API_KEY?.trim();
    if (!apiKey) {
      console.warn('[BirdeyeProvider] Missing API key');
      return null;
    }

    // 1. Check Cache
    const cached = this.cache.get(cacheKey);
    const ttlMs = this.getTTL(baseTTLMs, isCritical);

    if (cached) {
      if (Date.now() < cached.expiresAt) {
        this.usage.cacheHits++;
        return cached.value as T;
      }
      // If we are in CRITICAL mode and it's not a critical request, we might just return stale cache
      // rather than burning API calls
      if (!isCritical && this.usage.usageMode === 'CRITICAL') {
        console.warn(`[BirdeyeProvider] CRITICAL budget mode: returning stale data for ${cacheKey}`);
        this.usage.cacheHits++;
        return cached.value as T;
      }
    }
    this.usage.cacheMisses++;

    // 2. Check In-Flight (Deduplication)
    if (this.inFlight.has(cacheKey)) {
      this.usage.deduplicatedRequests++;
      return this.inFlight.get(cacheKey) as Promise<T | null>;
    }

    // 3. Execute Network Request
    const executeReq = async (): Promise<T | null> => {
      await this.acquireToken();
      try {
        const url = `https://public-api.birdeye.so${path}`;
        const res = await fetch(url, {
          headers: {
            'X-API-KEY': apiKey,
            'x-chain': 'solana',
            'Accept': 'application/json'
          }
        });

        this.usage.requestsToday++;
        this.usage.requestsThisHour++;
        this.usage.lastRequestAt = new Date().toISOString();

        if (res.status === 429) {
          // Rate limited
          this.usage.failedRequests++;
          const retryAfter = res.headers.get('Retry-After');
          const backoff = retryAfter ? parseInt(retryAfter) * 1000 : 5000; // default 5s
          this.rateLimitUntil = Date.now() + backoff;
          console.warn(`[BirdeyeProvider] 429 Rate Limited. Backing off for ${backoff}ms`);
          return null; // Or throw depending on preference. Null safely fails fallback.
        }

        if (!res.ok) {
          this.usage.failedRequests++;
          console.warn(`[BirdeyeProvider] HTTP ${res.status} for ${path}`);
          return null;
        }

        const data = await res.json();
        
        // Cache result
        if (data && data.success) {
           this.cache.set(cacheKey, {
             value: data.data,
             fetchedAt: Date.now(),
             expiresAt: Date.now() + ttlMs
           });
           return data.data as T;
        }
        
        this.usage.failedRequests++;
        return null;
      } catch (err) {
        this.usage.failedRequests++;
        console.error(`[BirdeyeProvider] Network error for ${path}:`, err);
        return null;
      } finally {
        this.releaseToken();
        this.inFlight.delete(cacheKey);
      }
    };

    const promise = executeReq();
    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  public static async getPrice(tokenAddress: string): Promise<{ value: number, updateUnixTime: number } | null> {
    const ttl = parseInt(process.env.BIRDEYE_PRICE_CACHE_TTL_MS || '120000'); // 2 mins default
    const data = await this.request<any>(
      `/defi/price?address=${tokenAddress}`, 
      `birdeye:price:${tokenAddress}`, 
      ttl, 
      true // Price is critical if requested as fallback
    );
    if (!data) return null;
    return {
      value: data.value,
      updateUnixTime: data.updateUnixTime || Math.floor(Date.now() / 1000)
    };
  }

  public static async getTokenOverview(tokenAddress: string): Promise<any | null> {
    const ttl = parseInt(process.env.BIRDEYE_TOKEN_OVERVIEW_TTL_MS || '1800000'); // 30 mins
    return this.request<any>(
      `/defi/token_overview?address=${tokenAddress}`,
      `birdeye:overview:${tokenAddress}`,
      ttl,
      false
    );
  }

  public static async getSecurity(tokenAddress: string): Promise<any | null> {
    const ttl = parseInt(process.env.BIRDEYE_SECURITY_TTL_MS || '21600000'); // 6 hours
    return this.request<any>(
      `/defi/token_security?address=${tokenAddress}`, // Assuming this is a valid endpoint, adjust if not. If not, use token_overview parts.
      `birdeye:security:${tokenAddress}`,
      ttl,
      false
    );
  }

  public static async checkHealth(): Promise<ProviderHealthRecord> {
    const cacheKey = 'birdeye:health';
    const cached = this.cache.get(cacheKey);
    const ttl = parseInt(process.env.BIRDEYE_HEALTH_TTL_MS || '600000'); // 10 mins

    if (cached && Date.now() < cached.expiresAt) {
      return cached.value as ProviderHealthRecord;
    }
    
    // In-flight dedupe for health check
    if (this.inFlight.has(cacheKey)) {
       return this.inFlight.get(cacheKey) as Promise<ProviderHealthRecord>;
    }

    const executeHealth = async (): Promise<ProviderHealthRecord> => {
       const apiKey = process.env.BIRDEYE_API_KEY?.trim();
       if (!apiKey) {
         return {
           providerName: 'Birdeye',
           status: 'NOT_CONFIGURED',
           lastChecked: new Date().toISOString(),
           message: 'BIRDEYE_API_KEY is not defined in environment.'
         };
       }

       try {
         const start = Date.now();
         // Lightest reliable endpoint, maybe just WS or a very basic token price
         const res = await fetch('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112', {
            headers: { 'X-API-KEY': apiKey, 'x-chain': 'solana' }
         });
         const duration = Date.now() - start;

         if (res.status === 429) {
           const record: ProviderHealthRecord = {
             providerName: 'Birdeye',
             status: 'DEGRADED',
             lastChecked: new Date().toISOString(),
             latencyMs: duration,
             message: 'Birdeye returned HTTP 429 Rate Limited'
           };
           this.cache.set(cacheKey, { value: record, fetchedAt: Date.now(), expiresAt: Date.now() + ttl });
           return record;
         }

         if (!res.ok) {
           return {
             providerName: 'Birdeye',
             status: 'DEGRADED',
             lastChecked: new Date().toISOString(),
             latencyMs: duration,
             message: `Birdeye returned status HTTP ${res.status}`
           };
         }
         
         const record: ProviderHealthRecord = {
             providerName: 'Birdeye',
             status: 'CONNECTED',
             lastChecked: new Date().toISOString(),
             lastSuccessfulEvent: new Date().toISOString(),
             latencyMs: duration,
             message: 'Birdeye live DeFi pricing verified.'
         };
         this.cache.set(cacheKey, { value: record, fetchedAt: Date.now(), expiresAt: Date.now() + ttl });
         return record;
       } catch (err: any) {
         return {
           providerName: 'Birdeye',
           status: 'UNREACHABLE',
           lastChecked: new Date().toISOString(),
           message: `Birdeye health check failed: ${err.message}`
         };
       } finally {
         this.inFlight.delete(cacheKey);
       }
    };
    
    const promise = executeHealth();
    this.inFlight.set(cacheKey, promise);
    return promise;
  }
}
