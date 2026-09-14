import Redis from 'ioredis';

export class RedisClientService {
  private static instance: Redis | null = null;
  private static isConnecting = false;

  /**
   * Normalize and sanitize Redis URL from various possible formats:
   * 1. rediss://default:token@host:6379 (TLS enabled)
   * 2. redis://default:token@host:6379 (automatically converted to rediss:// for Upstash)
   * 3. UPSTASH_REDIS_REST_URL="https://host" UPSTASH_REDIS_REST_TOKEN="token"
   */
  public static normalizeRedisUrl(raw?: string): string | null {
    const candidate = raw || process.env.REDIS_URL;
    if (!candidate || typeof candidate !== 'string') return null;

    let clean = candidate.trim().replace(/^['"]|['"]$/g, '');
    if (!clean) return null;

    // Check for Upstash REST format passed into REDIS_URL
    if (clean.includes('UPSTASH_REDIS_REST_URL') || clean.includes('upstash.io')) {
      const tokenMatch = clean.match(/UPSTASH_REDIS_REST_TOKEN=["']?([^"'\s]+)/);
      const urlMatch = clean.match(/UPSTASH_REDIS_REST_URL=["']?https:\/\/([^"'\s/]+)/);
      if (tokenMatch && urlMatch) {
        return `rediss://default:${tokenMatch[1]}@${urlMatch[1]}:6379`;
      }
    }

    // Convert redis:// to rediss:// if host is upstash.io or contains tls requirement
    if (clean.startsWith('redis://') && clean.includes('upstash.io')) {
      clean = clean.replace('redis://', 'rediss://');
    }

    return clean;
  }

  /**
   * Lazily get or initialize the Redis client singleton
   */
  public static getClient(): Redis | null {
    const url = this.normalizeRedisUrl();
    if (!url) return null;

    if (this.instance) {
      return this.instance;
    }

    try {
      const isTls = url.startsWith('rediss://') || url.includes('upstash.io');
      this.instance = new Redis(url, {
        connectTimeout: 5000,
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        enableReadyCheck: true,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        retryStrategy(times) {
          if (times > 5) return null; // stop reconnecting after 5 attempts
          return Math.min(times * 200, 2000);
        }
      });

      this.instance.on('error', (err) => {
        // Suppress unhandled errors to avoid server crashes
        console.warn(`[RedisClientService] Redis connection event: ${err?.message || err}`);
      });

      return this.instance;
    } catch (err) {
      console.warn(`[RedisClientService] Failed to initialize Redis:`, err);
      return null;
    }
  }

  /**
   * Perform live health check with real PING and latency measurement
   */
  public static async checkHealth(): Promise<{
    connected: boolean;
    latencyMs: number;
    message: string;
  }> {
    const url = this.normalizeRedisUrl();
    if (!url) {
      return {
        connected: false,
        latencyMs: 0,
        message: 'REDIS_URL is not configured.'
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        connected: false,
        latencyMs: 0,
        message: 'Failed to instantiate Redis client.'
      };
    }

    try {
      const start = Date.now();
      if (client.status === 'wait') {
        await client.connect();
      }
      const pong = await client.ping();
      const latencyMs = Date.now() - start;

      if (pong === 'PONG') {
        return {
          connected: true,
          latencyMs,
          message: `Redis cache connection active (${url.includes('upstash.io') ? 'Upstash TLS' : 'TCP'}).`
        };
      } else {
        return {
          connected: false,
          latencyMs,
          message: `Unexpected PING response: ${pong}`
        };
      }
    } catch (err: any) {
      return {
        connected: false,
        latencyMs: 0,
        message: `Redis ping failed: ${err?.message || 'Connection error'}`
      };
    }
  }

  /**
   * Cached key-value helpers with graceful fallback
   */
  public static async get(key: string): Promise<string | null> {
    try {
      const client = this.getClient();
      if (!client) return null;
      if (client.status === 'wait') await client.connect();
      return await client.get(key);
    } catch {
      return null;
    }
  }

  public static async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) return null as any;
      if (client.status === 'wait') await client.connect();
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, value, 'EX', ttlSeconds);
      } else {
        await client.set(key, value);
      }
      return true;
    } catch {
      return false;
    }
  }

  public static async disconnect(): Promise<void> {
    if (this.instance) {
      try {
        await this.instance.quit();
      } catch {
        this.instance.disconnect();
      } finally {
        this.instance = null;
      }
    }
  }
}
