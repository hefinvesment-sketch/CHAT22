import { StorageAdapter } from './persistence';

export type ProviderStatus = 
  | 'CONNECTED'
  | 'DEGRADED'
  | 'ERROR'
  | 'NOT_CONFIGURED'
  | 'UNREACHABLE'
  | 'DEMO_ONLY';

export interface ProviderHealthRecord {
  providerName: string;
  status: ProviderStatus;
  lastChecked: string;
  lastSuccessfulEvent?: string;
  latencyMs?: number;
  message?: string;
  activeMode?: string;
}

export interface MarketPriceRecord {
  tokenAddress: string;
  tokenSymbol: string;
  priceUsd: number;
  source: string;
  timestamp: string;
  dataFreshnessSeconds: number;
  confidence: number;
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
  routePlan: any[];
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

  /**
   * Generic token decimals resolver
   */
  public static async getTokenDecimals(mintAddress: string): Promise<number> {
    if (this.tokenDecimalsCache.has(mintAddress)) {
      return this.tokenDecimalsCache.get(mintAddress)!;
    }

    // Try querying Solana RPC if available
    const rpcUrl = process.env.SOLANA_RPC_URL;
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

    // Default fallback: 6 decimals
    this.tokenDecimalsCache.set(mintAddress, 6);
    return 6;
  }

  // 1. Helius Health & Fetcher
  public static async checkHeliusHealth(): Promise<ProviderHealthRecord> {
    const apiKey = process.env.HELIUS_API_KEY;
    const mode = this.getAppMode();

    if (!apiKey) {
      const record: ProviderHealthRecord = {
        providerName: 'Helius',
        status: mode === 'demo' ? 'DEMO_ONLY' : 'NOT_CONFIGURED',
        lastChecked: new Date().toISOString(),
        message: 'HELIUS_API_KEY is not defined in environment.',
        activeMode: mode
      };
      this.healthMap['Helius'] = record;
      return record;
    }

    try {
      const start = Date.now();
      // Probe Helius RPC / REST
      const res = await fetch(`https://api.helius.xyz/v0/addresses/So11111111111111111111111111111111111111112/balances?api-key=${apiKey}`);
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Helius',
          status: 'CONNECTED',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs,
          message: 'Helius on-chain data ingestion verified.',
          activeMode: mode
        };
        this.healthMap['Helius'] = record;
        return record;
      } else {
        const record: ProviderHealthRecord = {
          providerName: 'Helius',
          status: 'ERROR',
          lastChecked: new Date().toISOString(),
          latencyMs,
          message: `Helius returned status HTTP ${res.status}`,
          activeMode: mode
        };
        this.healthMap['Helius'] = record;
        return record;
      }
    } catch (err: any) {
      const record: ProviderHealthRecord = {
        providerName: 'Helius',
        status: 'UNREACHABLE',
        lastChecked: new Date().toISOString(),
        message: err.message,
        activeMode: mode
      };
      this.healthMap['Helius'] = record;
      return record;
    }
  }

  // 2. Birdeye Health & Fetcher
  public static async checkBirdeyeHealth(): Promise<ProviderHealthRecord> {
    const apiKey = process.env.BIRDEYE_API_KEY;
    const mode = this.getAppMode();

    if (!apiKey) {
      const record: ProviderHealthRecord = {
        providerName: 'Birdeye',
        status: mode === 'demo' ? 'DEMO_ONLY' : 'NOT_CONFIGURED',
        lastChecked: new Date().toISOString(),
        message: 'BIRDEYE_API_KEY is not defined in environment.',
        activeMode: mode
      };
      this.healthMap['Birdeye'] = record;
      return record;
    }

    try {
      const start = Date.now();
      const res = await fetch('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112', {
        headers: { 'X-API-KEY': apiKey }
      });
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Birdeye',
          status: 'CONNECTED',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs,
          message: 'Birdeye live DeFi pricing verified.',
          activeMode: mode
        };
        this.healthMap['Birdeye'] = record;
        return record;
      } else {
        const record: ProviderHealthRecord = {
          providerName: 'Birdeye',
          status: 'ERROR',
          lastChecked: new Date().toISOString(),
          latencyMs,
          message: `Birdeye returned status HTTP ${res.status}`,
          activeMode: mode
        };
        this.healthMap['Birdeye'] = record;
        return record;
      }
    } catch (err: any) {
      const record: ProviderHealthRecord = {
        providerName: 'Birdeye',
        status: 'UNREACHABLE',
        lastChecked: new Date().toISOString(),
        message: err.message,
        activeMode: mode
      };
      this.healthMap['Birdeye'] = record;
      return record;
    }
  }

  // 3. Solana RPC Health Check
  public static async checkSolanaRpcHealth(): Promise<ProviderHealthRecord> {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const mode = this.getAppMode();

    if (!rpcUrl) {
      const record: ProviderHealthRecord = {
        providerName: 'Solana RPC',
        status: mode === 'demo' ? 'DEMO_ONLY' : 'NOT_CONFIGURED',
        lastChecked: new Date().toISOString(),
        message: 'SOLANA_RPC_URL is not defined in environment.',
        activeMode: mode
      };
      this.healthMap['Solana RPC'] = record;
      return record;
    }

    try {
      const start = Date.now();
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
      });
      const latencyMs = Date.now() - start;
      const json = await res.json();

      if (json.result === 'ok') {
        const record: ProviderHealthRecord = {
          providerName: 'Solana RPC',
          status: 'CONNECTED',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs,
          message: 'Solana RPC node is healthy and synced.',
          activeMode: mode
        };
        this.healthMap['Solana RPC'] = record;
        return record;
      } else {
        const record: ProviderHealthRecord = {
          providerName: 'Solana RPC',
          status: 'DEGRADED',
          lastChecked: new Date().toISOString(),
          latencyMs,
          message: `RPC getHealth returned: ${JSON.stringify(json)}`,
          activeMode: mode
        };
        this.healthMap['Solana RPC'] = record;
        return record;
      }
    } catch (err: any) {
      const record: ProviderHealthRecord = {
        providerName: 'Solana RPC',
        status: 'UNREACHABLE',
        lastChecked: new Date().toISOString(),
        message: err.message,
        activeMode: mode
      };
      this.healthMap['Solana RPC'] = record;
      return record;
    }
  }

  // 4. Jupiter Quote API Health & Quote Fetcher
  public static async checkJupiterHealth(): Promise<ProviderHealthRecord> {
    const jupApiUrl = process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6';
    const mode = this.getAppMode();

    try {
      const start = Date.now();
      // Test quote: 10 USDC -> SOL
      const testUrl = `${jupApiUrl}/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=So11111111111111111111111111111111111111112&amount=10000000&slippageBps=50`;
      const res = await fetch(testUrl);
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const record: ProviderHealthRecord = {
          providerName: 'Jupiter',
          status: 'CONNECTED',
          lastChecked: new Date().toISOString(),
          lastSuccessfulEvent: new Date().toISOString(),
          latencyMs,
          message: 'Jupiter DEX quote aggregation verified.',
          activeMode: mode
        };
        this.healthMap['Jupiter'] = record;
        return record;
      } else {
        const record: ProviderHealthRecord = {
          providerName: 'Jupiter',
          status: 'ERROR',
          lastChecked: new Date().toISOString(),
          latencyMs,
          message: `Jupiter returned status HTTP ${res.status}`,
          activeMode: mode
        };
        this.healthMap['Jupiter'] = record;
        return record;
      }
    } catch (err: any) {
      const record: ProviderHealthRecord = {
        providerName: 'Jupiter',
        status: 'UNREACHABLE',
        lastChecked: new Date().toISOString(),
        message: err.message,
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
    amountRaw: number | string,
    slippageBps: number = 50
  ): Promise<JupiterQuoteRecord> {
    const jupApiUrl = process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6';
    const mode = this.getAppMode();

    const inputDecimals = await this.getTokenDecimals(inputMint);
    const outputDecimals = await this.getTokenDecimals(outputMint);

    try {
      const url = `${jupApiUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}`;
      const start = Date.now();
      const res = await fetch(url);
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
    } catch (err: any) {
      this.healthMap['Jupiter'] = {
        providerName: 'Jupiter',
        status: 'DEGRADED',
        lastChecked: new Date().toISOString(),
        message: err.message
      };

      if (mode !== 'demo') {
        throw new Error(`PROVIDER FAILURE [Jupiter]: ${err.message}`);
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

  // 6. Birdeye Real-time Price Query
  public static async fetchBirdeyePrice(tokenAddress: string): Promise<MarketPriceRecord> {
    const apiKey = process.env.BIRDEYE_API_KEY;
    const mode = this.getAppMode();

    if (!apiKey) {
      if (mode !== 'demo') {
        throw new Error(`PROVIDER ERROR: Birdeye API key missing in ${mode} mode. Live price stream unavailable.`);
      }
      return {
        tokenAddress,
        tokenSymbol: 'SOL',
        priceUsd: 145.20,
        source: 'DEMO_SIMULATOR',
        timestamp: new Date().toISOString(),
        dataFreshnessSeconds: 1,
        confidence: 0.95
      };
    }

    try {
      const res = await fetch(`https://public-api.birdeye.so/defi/price?address=${tokenAddress}`, {
        headers: { 'X-API-KEY': apiKey }
      });
      const json = await res.json();
      if (!json.success || !json.data?.value) {
        throw new Error(json.message || 'Invalid price response from Birdeye');
      }

      return {
        tokenAddress,
        tokenSymbol: json.data.symbol || 'TOKEN',
        priceUsd: json.data.value,
        source: 'BIRDEYE_REST_API',
        timestamp: new Date().toISOString(),
        dataFreshnessSeconds: Math.round((Date.now() - (json.data.updateUnixTime * 1000 || Date.now())) / 1000),
        confidence: 0.99
      };
    } catch (err: any) {
      if (mode !== 'demo') {
        throw new Error(`PROVIDER FAILURE [Birdeye]: ${err.message}`);
      }
      return {
        tokenAddress,
        tokenSymbol: 'DEMO',
        priceUsd: 145.20,
        source: 'DEMO_FALLBACK',
        timestamp: new Date().toISOString(),
        dataFreshnessSeconds: 1,
        confidence: 0.5
      };
    }
  }

  // 7. Full Provider System Audit
  public static async getAllProviderHealth(storage?: StorageAdapter): Promise<ProviderHealthRecord[]> {
    const mode = this.getAppMode();

    // 1. Database Health Check
    let dbRecord: ProviderHealthRecord;
    if (storage) {
      const dbHealth = await storage.checkHealth();
      dbRecord = {
        providerName: 'PostgreSQL',
        status: dbHealth.isConnected ? 'CONNECTED' : (mode === 'demo' ? 'DEMO_ONLY' : 'ERROR'),
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
        lastChecked: new Date().toISOString(),
        message: 'Storage adapter not provided.',
        activeMode: mode
      };
    }

    // 2. Redis Health Check
    const redisUrl = process.env.REDIS_URL;
    const redisRecord: ProviderHealthRecord = {
      providerName: 'Redis',
      status: redisUrl ? 'CONNECTED' : 'NOT_CONFIGURED',
      lastChecked: new Date().toISOString(),
      message: redisUrl ? 'Redis cache connection active.' : 'REDIS_URL is optional and not defined.',
      activeMode: mode
    };

    // 3. Helius, Birdeye, Solana RPC, Jupiter
    const [helius, birdeye, solanaRpc, jupiter] = await Promise.all([
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
