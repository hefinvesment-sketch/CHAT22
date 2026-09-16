import { StorageAdapter } from './persistence';
import { RedisClientService } from './redisClient';
import { BirdeyeProvider } from './providers/birdeyeProvider';
import { getErrorMessage } from '../utils/errors';

export type ProviderStatus = 
  | 'CONNECTED'
  | 'DEGRADED'
  | 'ERROR'
  | 'NOT_CONFIGURED'
  | 'UNREACHABLE'
  | 'DEMO_ONLY';

export type ModeReadiness = 'DEMO_READY' | 'LIVE_CAPABLE' | 'LIVE_DISABLED' | 'UNCONFIGURED';

export interface ProviderHealthRecord {
  providerName: string;
  status: ProviderStatus;
  operationalStatus?: ProviderStatus;
  modeReadiness?: ModeReadiness;
  lastChecked: string;
  lastSuccessfulEvent?: string;
  latencyMs?: number | null;
  message?: string;
  activeMode?: string;
}

export interface MarketPriceRecord {
  tokenAddress: string;
  tokenSymbol: string;
  priceUsd: number;
  source: string;
  timestamp: string;
  observedAt?: string | null;
  fetchedAt?: string;
  dataFreshnessSeconds: number | null;
  confidence: number | null;
}

export interface JupiterQuoteRecord {
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  inAmountRaw: string;
  outAmountRaw: string;
  inAmountUi: number;
  outAmountUi: number;
  executionPrice: number; // inAmountUi / outAmountUi
  priceImpactPct: number;
  routePlan: unknown[];
  slippageBps: number;
  latencyMs: number;
  timestamp: string;
}

export interface HistoricalTransactionRecord {
  signature: string;
  slot: number;
  timestamp: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  type: 'BUY' | 'SELL' | 'SWAP' | 'STABLECOIN_ROTATION' | 'TRANSFER' | 'AIRDROP';
  tokenAmount: number;
  usdValue: number;
  executionPriceUsd: number;
  isStablecoinRotation: boolean;
}

export class RealDataProviders {
  // Known token mint decimal cache
  private static tokenDecimalsCache: Map<string, number> = new Map([
    ['So11111111111111111111111111111111111111112', 9], // SOL / WSOL
    ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6], // USDC
    ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 6], // USDT
    ['3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', 8], // WBTC
    ['7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', 8], // WETH
    ['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 6], // JUP
    ['DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7', 6], // DRIFT
    ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 5], // BONK
    ['EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 6], // WIF
    ['bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', 9], // bSOL
    ['mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', 9]  // mSOL
  ]);

  public static getAppMode(): 'demo' | 'live_paper' | 'historical_backtest' {
    const mode = process.env.APP_MODE || 'demo';
    if (mode === 'live_paper' || mode === 'historical_backtest') return mode;
    return 'demo';
  }

  // Provider health cache
  private static healthMap: Record<string, ProviderHealthRecord> = {};

  private static cachedWorkingRpcUrl: string | null = null;
  private static lastRpcUrlCheck = 0;

  /**
   * Safe probe of a Solana RPC endpoint with getHealth
   */
  public static async probeSolanaRpc(url: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    try {
      const start = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      }
      const json = await res.json().catch(() => null);
      if (json && (json.result === 'ok' || json.result === 'healthy' || typeof json.result === 'number')) {
        return { ok: true, latencyMs };
      }
      return { ok: false, latencyMs, error: json?.error?.message || 'Unhealthy RPC response' };
    } catch (err: unknown) {
      return { ok: false, latencyMs: 0, error: getErrorMessage(err) };
    }
  }

  /**
   * Returns an ordered list of candidate Solana RPC URLs
   */
  public static getCandidateSolanaRpcUrls(): string[] {
    const list: string[] = [];
    const primaryUrl = process.env.SOLANA_RPC_URL?.trim();
    if (primaryUrl) list.push(primaryUrl);

    const heliusKey = this.getHeliusApiKey();
    if (heliusKey) {
      list.push(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`);
    }

    list.push('https://api.mainnet-beta.solana.com');
    list.push('https://solana-api.projectserum.com');
    return list;
  }

  /**
   * Returns a validated working Solana RPC URL, testing candidate RPCs in priority order
   */
  public static async getWorkingSolanaRpcUrl(): Promise<string> {
    const now = Date.now();
    if (this.cachedWorkingRpcUrl && now - this.lastRpcUrlCheck < 60000) {
      return this.cachedWorkingRpcUrl;
    }

    const candidates = this.getCandidateSolanaRpcUrls();
    for (const url of candidates) {
      const probe = await this.probeSolanaRpc(url);
      if (probe.ok) {
        this.cachedWorkingRpcUrl = url;
        this.lastRpcUrlCheck = now;
        return url;
      }
    }

    this.cachedWorkingRpcUrl = 'https://api.mainnet-beta.solana.com';
    this.lastRpcUrlCheck = now;
    return this.cachedWorkingRpcUrl;
  }

  /**
   * Reusable RPC caller with retry, exponential backoff, and 429 Retry-After handling
   */
  public static async callRpcWithRetry<T>(
    fn: (endpoint: string) => Promise<T>,
    retries = 3
  ): Promise<T> {
    const candidates = this.getCandidateSolanaRpcUrls();
    let lastError: unknown = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      const endpoint = candidates[attempt % candidates.length] || 'https://api.mainnet-beta.solana.com';
      try {
        return await fn(endpoint);
      } catch (err: unknown) {
        lastError = err;
        const msg = getErrorMessage(err);
        const isRateLimit = msg.includes('429');
        const delayMs = isRateLimit ? 1000 * Math.pow(2, attempt) + Math.random() * 200 : 300 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError || new Error('All RPC attempts failed');
  }

  /**
   * Generic token decimals resolver
   */
  public static async getTokenDecimals(mintAddress: string): Promise<number> {
    if (this.tokenDecimalsCache.has(mintAddress)) {
      return this.tokenDecimalsCache.get(mintAddress)!;
    }

    // Try querying Solana RPC if available
    const rpcUrl = await this.getWorkingSolanaRpcUrl();
    if (rpcUrl) {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: [mintAddress, { encoding: 'jsonParsed' }]
          })
        });
        const json = await res.json();
        const decimals = json?.result?.value?.data?.parsed?.info?.decimals;
        if (typeof decimals === 'number') {
          this.tokenDecimalsCache.set(mintAddress, decimals);
          return decimals;
        }
      } catch (err) {
        // Fallback below
      }
    }

    // If failed to resolve decimals:
    const mode = this.getAppMode();
    if (mode === 'live_paper') {
      throw new Error(`TOKEN_DECIMALS_UNAVAILABLE: Could not resolve on-chain decimals for mint ${mintAddress}`);
    }

    // Default fallback in demo mode only
    this.tokenDecimalsCache.set(mintAddress, 6);
    return 6;
  }

  // Helper to ensure secret keys are NEVER leaked in messages or logs
  public static sanitizeMessage(msg?: string): string {
    if (!msg) return '';
    let sanitized = String(msg);
    const secrets = [
      process.env.HELIUS_API_KEY,
      process.env.BIRDEYE_API_KEY,
      process.env.JUPITER_API_KEY,
      process.env.DATABASE_URL,
      process.env.REDIS_URL,
      process.env.SOLANA_RPC_URL,
      process.env.GEMINI_API_KEY
    ].filter((s): s is string => Boolean(s && s.length > 3));

    for (const sec of secrets) {
      sanitized = sanitized.split(sec).join('[REDACTED]');
    }
    return sanitized.replace(/api-key=[^&\s]+/gi, 'api-key=[REDACTED]');
  }

  // 1. Helius Health & Fetcher
  public static getHeliusApiKey(): string | undefined {
    return process.env.HELIUS_API_KEY?.trim() || undefined;
  }

  public static async checkHeliusHealth(): Promise<ProviderHealthRecord> {
    const apiKey = this.getHeliusApiKey();
    const mode = this.getAppMode();

    if (!apiKey) {
      const record: ProviderHealthRecord = {
        providerName: 'Helius',
        status: mode === 'demo' ? 'DEMO_ONLY' : 'NOT_CONFIGURED',
        operationalStatus: 'NOT_CONFIGURED',
        modeReadiness: mode === 'demo' ? 'DEMO_READY' : 'UNCONFIGURED',
        lastChecked: new Date().toISOString(),
        latencyMs: null,
        message: 'HELIUS_API_KEY is not defined in environment.',
        activeMode: mode
      };
      this.healthMap['Helius'] = record;
      return record;
    }

    try {
      const start = Date.now();
      // Probe Helius-owned endpoint directly with HELIUS_API_KEY
      const heliusEndpoint = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
      const res = await fetch(heliusEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
      });
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && (json.result === 'ok' || json.result === 'healthy' || typeof json.result === 'number')) {
          const record: ProviderHealthRecord = {
            providerName: 'Helius',
            status: 'CONNECTED',
            operationalStatus: 'CONNECTED',
            modeReadiness: 'LIVE_CAPABLE',
            lastChecked: new Date().toISOString(),
            lastSuccessfulEvent: new Date().toISOString(),
            latencyMs,
            message: 'Helius on-chain data stream verified & synced.',
            activeMode: mode
          };
          this.healthMap['Helius'] = record;
          return record;
        }
      }

      // If Helius endpoint returned 401/403 or non-200:
      // Mark Helius DEGRADED or ERROR, indicating standard RPC fallback. Do not lie that Helius is CONNECTED.
      const record: ProviderHealthRecord = {
        providerName: 'Helius',
        status: 'DEGRADED',
        operationalStatus: 'DEGRADED',
        modeReadiness: mode === 'live_paper' ? 'LIVE_DISABLED' : 'DEMO_READY',
        lastChecked: new Date().toISOString(),
        latencyMs,
        message: `Helius API key returned HTTP ${res.status}; FALLBACK_STANDARD_RPC active.`,
        activeMode: mode
      };
      this.healthMap['Helius'] = record;
      return record;
    } catch (err: unknown) {
      const record: ProviderHealthRecord = {
        providerName: 'Helius',
        status: 'DEGRADED',
        operationalStatus: 'DEGRADED',
        modeReadiness: mode === 'live_paper' ? 'LIVE_DISABLED' : 'DEMO_READY',
        lastChecked: new Date().toISOString(),
        latencyMs: null,
        message: `Helius connection issue: ${this.sanitizeMessage(getErrorMessage(err))}; FALLBACK_STANDARD_RPC active.`,
        activeMode: mode
      };
      this.healthMap['Helius'] = record;
      return record;
    }
  }

  public static async checkBirdeyeHealth(): Promise<ProviderHealthRecord> {
    const health = await BirdeyeProvider.checkHealth();
    this.healthMap['Birdeye'] = health;
    return health;
  }

  // 3. Solana RPC Health Check
  public static async checkSolanaRpcHealth(): Promise<ProviderHealthRecord> {
    const primaryUrl = process.env.SOLANA_RPC_URL;
    const mode = this.getAppMode();

    if (!primaryUrl) {
      const fallbackProbe = await this.probeSolanaRpc('https://api.mainnet-beta.solana.com');
      if (fallbackProbe.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Solana RPC',
          status: 'CONNECTED',
          operationalStatus: 'CONNECTED',
          modeReadiness: 'LIVE_CAPABLE',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs: fallbackProbe.latencyMs,
          message: 'Solana RPC connected (via public mainnet endpoint).',
          activeMode: mode
        };
        this.healthMap['Solana RPC'] = record;
        return record;
      }

      const record: ProviderHealthRecord = {
        providerName: 'Solana RPC',
        status: mode === 'demo' ? 'DEMO_ONLY' : 'NOT_CONFIGURED',
        operationalStatus: 'NOT_CONFIGURED',
        modeReadiness: mode === 'demo' ? 'DEMO_READY' : 'UNCONFIGURED',
        lastChecked: new Date().toISOString(),
        latencyMs: null,
        message: 'SOLANA_RPC_URL is not defined in environment.',
        activeMode: mode
      };
      this.healthMap['Solana RPC'] = record;
      return record;
    }

    try {
      // 1. Probe primary configured RPC
      const primaryProbe = await this.probeSolanaRpc(primaryUrl);
      if (primaryProbe.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Solana RPC',
          status: 'CONNECTED',
          operationalStatus: 'CONNECTED',
          modeReadiness: 'LIVE_CAPABLE',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs: primaryProbe.latencyMs,
          message: 'Solana RPC node is healthy and synced.',
          activeMode: mode
        };
        this.healthMap['Solana RPC'] = record;
        return record;
      }

      // 2. Primary failed or returned 401/error. Failover to standard public Solana mainnet RPC
      const fallbackProbe = await this.probeSolanaRpc('https://api.mainnet-beta.solana.com');
      if (fallbackProbe.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Solana RPC',
          status: 'CONNECTED',
          operationalStatus: 'CONNECTED',
          modeReadiness: 'LIVE_CAPABLE',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs: fallbackProbe.latencyMs,
          message: `Primary RPC returned ${this.sanitizeMessage(primaryProbe.error)}; failover active via public Solana mainnet RPC.`,
          activeMode: mode
        };
        this.healthMap['Solana RPC'] = record;
        return record;
      }

      // 3. Both failed
      const record: ProviderHealthRecord = {
        providerName: 'Solana RPC',
        status: 'UNREACHABLE',
        operationalStatus: 'UNREACHABLE',
        modeReadiness: mode === 'live_paper' ? 'LIVE_DISABLED' : 'DEMO_READY',
        lastChecked: new Date().toISOString(),
        latencyMs: null,
        message: this.sanitizeMessage(primaryProbe.error || 'Solana RPC connection unreachable'),
        activeMode: mode
      };
      this.healthMap['Solana RPC'] = record;
      return record;
    } catch (err: unknown) {
      // Fallback check on exception
      const fallbackProbe = await this.probeSolanaRpc('https://api.mainnet-beta.solana.com');
      if (fallbackProbe.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Solana RPC',
          status: 'CONNECTED',
          operationalStatus: 'CONNECTED',
          modeReadiness: 'LIVE_CAPABLE',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs: fallbackProbe.latencyMs,
          message: `Primary RPC error (${this.sanitizeMessage(getErrorMessage(err))}); failover active via public Solana mainnet RPC.`,
          activeMode: mode
        };
        this.healthMap['Solana RPC'] = record;
        return record;
      }

      const record: ProviderHealthRecord = {
        providerName: 'Solana RPC',
        status: 'UNREACHABLE',
        operationalStatus: 'UNREACHABLE',
        modeReadiness: mode === 'live_paper' ? 'LIVE_DISABLED' : 'DEMO_READY',
        lastChecked: new Date().toISOString(),
        latencyMs: null,
        message: this.sanitizeMessage(getErrorMessage(err)),
        activeMode: mode
      };
      this.healthMap['Solana RPC'] = record;
      return record;
    }
  }

  // Jupiter endpoint & authentication helpers
  public static getJupiterApiKey(): string {
    const key = process.env.JUPITER_API_KEY;
    if (key && key.trim().length > 0) return key.trim();
    const urlVar = process.env.JUPITER_API_URL;
    if (urlVar && (urlVar.startsWith('jup_') || !urlVar.startsWith('http'))) {
      return urlVar.trim();
    }
    return '';
  }

  public static getJupiterBaseUrl(): string {
    const urlVar = process.env.JUPITER_API_URL;
    if (urlVar && urlVar.startsWith('http') && !urlVar.includes('quote-api.jup.ag')) {
      return urlVar.replace(/\/+$/, '');
    }
    return 'https://api.jup.ag';
  }

  private static getJupiterHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    const apiKey = this.getJupiterApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    return headers;
  }

  private static getJupiterQuoteUrl(
    inputMint: string,
    outputMint: string,
    amountRaw: number | string,
    slippageBps: number = 50
  ): string {
    const baseUrl = this.getJupiterBaseUrl();
    const quotePath = baseUrl.includes('api.jup.ag') ? '/swap/v1/quote' : '/quote';
    return `${baseUrl}${quotePath}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}`;
  }

  // 4. Jupiter Quote API Health & Quote Fetcher
  public static async checkJupiterHealth(): Promise<ProviderHealthRecord> {
    const mode = this.getAppMode();
    const hasKey = Boolean(process.env.JUPITER_API_KEY);

    try {
      const start = Date.now();
      // Test quote: 10 USDC -> SOL
      const testUrl = this.getJupiterQuoteUrl(
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'So11111111111111111111111111111111111111112',
        10000000,
        50
      );
      const res = await fetch(testUrl, {
        headers: this.getJupiterHeaders()
      });
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Jupiter',
          status: 'CONNECTED',
          operationalStatus: 'CONNECTED',
          modeReadiness: 'LIVE_CAPABLE',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs,
          message: hasKey 
            ? 'Jupiter DEX swap routing and pricing authenticated via API Key.' 
            : 'Jupiter DEX quote aggregation verified.',
          activeMode: mode
        };
        this.healthMap['Jupiter'] = record;
        return record;
      } else {
        const record: ProviderHealthRecord = {
          providerName: 'Jupiter',
          status: 'ERROR',
          operationalStatus: 'ERROR',
          modeReadiness: mode === 'live_paper' ? 'LIVE_DISABLED' : 'DEMO_READY',
          lastChecked: new Date().toISOString(),
          latencyMs,
          message: `Jupiter returned status HTTP ${res.status}`,
          activeMode: mode
        };
        this.healthMap['Jupiter'] = record;
        return record;
      }
    } catch (err: unknown) {
      const record: ProviderHealthRecord = {
        providerName: 'Jupiter',
        status: 'UNREACHABLE',
        operationalStatus: 'UNREACHABLE',
        modeReadiness: mode === 'live_paper' ? 'LIVE_DISABLED' : 'DEMO_READY',
        lastChecked: new Date().toISOString(),
        latencyMs: null,
        message: this.sanitizeMessage(getErrorMessage(err)),
        activeMode: mode
      };
      this.healthMap['Jupiter'] = record;
      return record;
    }
  }

  // 5. Generic Executable Jupiter Quote Fetcher (Generic Decimals!)
  public static async fetchJupiterQuote(
    inputMint: string,
    outputMint: string,
    amountRaw: number,
    slippageBps: number = 50
  ): Promise<JupiterQuoteRecord> {
    const mode = this.getAppMode();

    const inputDecimals = await this.getTokenDecimals(inputMint);
    const outputDecimals = await this.getTokenDecimals(outputMint);

    try {
      const url = this.getJupiterQuoteUrl(inputMint, outputMint, amountRaw, slippageBps);
      const start = Date.now();
      const res = await fetch(url, {
        headers: this.getJupiterHeaders()
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        throw new Error(`Jupiter Quote API responded with status HTTP ${res.status}`);
      }

      const json = await res.json();
      const outAmountRaw = String(json.outAmount || '0');
      const inAmountUi = Number(amountRaw) / Math.pow(10, inputDecimals);
      const outAmountUi = Number(outAmountRaw) / Math.pow(10, outputDecimals);
      const priceImpactPct = Number(json.priceImpactPct || 0);

      // Generic executable quote price: inAmountUi / outAmountUi
      const executionPrice = outAmountUi > 0 ? inAmountUi / outAmountUi : 0;

      this.healthMap['Jupiter'] = {
        providerName: 'Jupiter',
        status: 'CONNECTED',
        lastChecked: new Date().toISOString(),
        lastSuccessfulEvent: new Date().toISOString(),
        latencyMs
      };

      return {
        inputMint,
        outputMint,
        inputDecimals,
        outputDecimals,
        inAmountRaw: String(amountRaw),
        outAmountRaw,
        inAmountUi,
        outAmountUi,
        executionPrice,
        priceImpactPct,
        routePlan: json.routePlan || [],
        slippageBps,
        latencyMs,
        timestamp: new Date().toISOString()
      };
    } catch (err: unknown) {
      this.healthMap['Jupiter'] = {
        providerName: 'Jupiter',
        status: 'DEGRADED',
        lastChecked: new Date().toISOString(),
        message: getErrorMessage(err)
      };

      if (mode !== 'demo') {
        throw new Error(`PROVIDER FAILURE [Jupiter]: ${getErrorMessage(err)}`, { cause: err });
      }

      // Demo fallback only
      const inAmountUi = Number(amountRaw) / Math.pow(10, inputDecimals);
      const outAmountUi = inAmountUi / 145.20;
      return {
        inputMint,
        outputMint,
        inputDecimals,
        outputDecimals,
        inAmountRaw: String(amountRaw),
        outAmountRaw: String(Math.round(outAmountUi * Math.pow(10, outputDecimals))),
        inAmountUi,
        outAmountUi,
        executionPrice: 145.20,
        priceImpactPct: 0.08,
        routePlan: [],
        slippageBps,
        latencyMs: 120,
        timestamp: new Date().toISOString()
      };
    }
  }

  public static async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amountRaw: number | string,
    slippageBps: number = 50
  ): Promise<JupiterQuoteRecord> {
    return this.fetchJupiterQuote(inputMint, outputMint, Number(amountRaw), slippageBps);
  }

  // 6. Jupiter Real-time Price Query (Price V3 API)
  public static async fetchJupiterPrice(tokenAddress: string): Promise<MarketPriceRecord | null> {
    const baseUrl = this.getJupiterBaseUrl();
    const priceUrl = `${baseUrl}/price/v3?ids=${tokenAddress}`;

    try {
      const res = await fetch(priceUrl, {
        headers: this.getJupiterHeaders()
      });
      if (!res.ok) return null;

      const json = await res.json();
      const tokenData = json[tokenAddress];
      if (!tokenData || typeof tokenData.usdPrice !== 'number') return null;

      const observedAt = tokenData.createdAt || new Date().toISOString();
      return {
        tokenAddress,
        tokenSymbol: tokenAddress === 'So11111111111111111111111111111111111111112' ? 'SOL' : 'TOKEN',
        priceUsd: tokenData.usdPrice,
        source: 'JUPITER_PRICE_V3',
        timestamp: observedAt,
        observedAt,
        fetchedAt: new Date().toISOString(),
        dataFreshnessSeconds: 1,
        confidence: 0.99
      };
    } catch {
      return null;
    }
  }

  // 7. Birdeye Real-time Price Query (with Jupiter V3 fallback)
  public static async fetchBirdeyePrice(tokenAddress: string): Promise<MarketPriceRecord> {
    const mode = this.getAppMode();
    const apiKey = process.env.BIRDEYE_API_KEY?.trim();

    if (!apiKey) {
      // First try live Jupiter Price V3 if Jupiter key or API is available
      const jupPrice = await this.fetchJupiterPrice(tokenAddress);
      if (jupPrice) return jupPrice;

      if (mode !== 'demo') {
        throw new Error(`PROVIDER ERROR: Birdeye API key missing and Jupiter Price API unavailable in ${mode} mode.`);
      }
      const nowIso = new Date().toISOString();
      return {
        tokenAddress,
        tokenSymbol: 'SOL',
        priceUsd: 145.20,
        source: 'DEMO_SIMULATOR',
        timestamp: nowIso,
        observedAt: nowIso,
        fetchedAt: nowIso,
        dataFreshnessSeconds: 1,
        confidence: 0.95
      };
    }

    try {
      const data = await BirdeyeProvider.getPrice(tokenAddress);
      if (!data || typeof data.value !== 'number' || data.value <= 0) {
        throw new Error(`Invalid price response from Birdeye cache/API`);
      }

      const updateUnixTime = data.updateUnixTime;
      const observedAt = updateUnixTime ? new Date(updateUnixTime * 1000).toISOString() : null;
      const dataFreshnessSeconds = updateUnixTime
        ? Math.max(0, Math.round((Date.now() - updateUnixTime * 1000) / 1000))
        : null;

      return {
        tokenAddress,
        tokenSymbol: 'TOKEN',
        priceUsd: data.value,
        source: 'BIRDEYE_REST_API',
        timestamp: observedAt || new Date().toISOString(),
        observedAt,
        fetchedAt: new Date().toISOString(),
        dataFreshnessSeconds,
        confidence: 0.99
      };
    } catch (err: unknown) {
      // Try live Jupiter Price V3 before throwing or falling back
      const jupPrice = await this.fetchJupiterPrice(tokenAddress);
      if (jupPrice) return jupPrice;

      if (mode !== 'demo') {
        throw new Error(`PROVIDER FAILURE [Birdeye]: ${getErrorMessage(err)}`, { cause: err });
      }
      return {
        tokenAddress,
        tokenSymbol: 'DEMO',
        priceUsd: 145.20,
        source: 'DEMO_FALLBACK',
        timestamp: new Date().toISOString(),
        observedAt: null,
        fetchedAt: new Date().toISOString(),
        dataFreshnessSeconds: null,
        confidence: 0.5
      };
    }
  }

  // 7. Redis Cache Health Check
  public static async checkRedisHealth(): Promise<ProviderHealthRecord> {
    const mode = this.getAppMode();
    const redisHealth = await RedisClientService.checkHealth();
    const isConfigured = Boolean(RedisClientService.normalizeRedisUrl());

    const status: ProviderStatus = redisHealth.connected 
      ? 'CONNECTED' 
      : (!isConfigured ? (mode === 'demo' ? 'DEMO_ONLY' : 'NOT_CONFIGURED') : 'ERROR');
    const operationalStatus: ProviderStatus = redisHealth.connected
      ? 'CONNECTED'
      : (!isConfigured ? 'NOT_CONFIGURED' : 'ERROR');
    const modeReadiness: ModeReadiness = redisHealth.connected
      ? 'LIVE_CAPABLE'
      : (!isConfigured ? (mode === 'demo' ? 'DEMO_READY' : 'UNCONFIGURED') : 'LIVE_DISABLED');

    const record: ProviderHealthRecord = {
      providerName: 'Redis',
      status,
      operationalStatus,
      modeReadiness,
      lastChecked: new Date().toISOString(),
      lastSuccessfulEvent: redisHealth.connected ? new Date().toISOString() : undefined,
      latencyMs: redisHealth.latencyMs,
      message: redisHealth.message,
      activeMode: mode
    };
    this.healthMap['Redis'] = record;
    return record;
  }

  // 8. Full Provider System Audit

  public static async getHeliusAsset(mintAddress: string): Promise<unknown> {
    const url = await this.getWorkingSolanaRpcUrl();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getAsset',
        params: { id: mintAddress }
      })
    });
    const data = await response.json();
    return data.result || null;
  }

  public static async getBirdeyeTokenInfo(mintAddress: string): Promise<unknown> {
    return await BirdeyeProvider.getTokenOverview(mintAddress);
  }

  public static async getAllProviderHealth(storage?: StorageAdapter): Promise<ProviderHealthRecord[]> {
    const mode = this.getAppMode();

    // 1. Database Health Check
    let dbRecord: ProviderHealthRecord;
    if (storage) {
      const dbHealth = await storage.checkHealth();
      const status: ProviderStatus = dbHealth.isConnected ? 'CONNECTED' : (mode === 'demo' ? 'DEMO_ONLY' : 'ERROR');
      const operationalStatus: ProviderStatus = dbHealth.isConnected ? 'CONNECTED' : 'ERROR';
      const modeReadiness: ModeReadiness = dbHealth.isConnected ? 'LIVE_CAPABLE' : (mode === 'demo' ? 'DEMO_READY' : 'LIVE_DISABLED');
      dbRecord = {
        providerName: 'PostgreSQL',
        status,
        operationalStatus,
        modeReadiness,
        lastChecked: new Date().toISOString(),
        lastSuccessfulEvent: dbHealth.isConnected ? new Date().toISOString() : undefined,
        latencyMs: dbHealth.latencyMs,
        message: dbHealth.message,
        activeMode: mode
      };
    } else {
      dbRecord = {
        providerName: 'PostgreSQL',
        status: mode === 'demo' ? 'DEMO_ONLY' : 'NOT_CONFIGURED',
        operationalStatus: 'NOT_CONFIGURED',
        modeReadiness: mode === 'demo' ? 'DEMO_READY' : 'UNCONFIGURED',
        lastChecked: new Date().toISOString(),
        latencyMs: null,
        message: 'Storage adapter not provided.',
        activeMode: mode
      };
    }

    // 2. Redis, Helius, Birdeye, Solana RPC, Jupiter concurrently
    const [redisRecord, helius, birdeye, solanaRpc, jupiter] = await Promise.all([
      this.checkRedisHealth(),
      this.checkHeliusHealth(),
      this.checkBirdeyeHealth(),
      this.checkSolanaRpcHealth(),
      this.checkJupiterHealth()
    ]);

    const records = [dbRecord, redisRecord, helius, birdeye, solanaRpc, jupiter];

    if (storage) {
      for (const r of records) {
        await storage.saveProviderHealth(r).catch(() => {});
      }
    }

    return records;
  }
}
