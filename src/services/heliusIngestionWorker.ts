import { TokenResolver } from './tokenResolver';
import { StorageAdapter } from './persistence';
import { HeliusTransactionParser, ParsedTransactionRecord } from './heliusParser';
import { WalletDiscoveryService } from './walletDiscovery';
import { AlphaEngine } from './alphaEngine';
import { RealisticSolanaExecutionSimulator } from './providers';
import { RealDataProviders } from './realDataProviders';
import { RedisClientService } from './redisClient';
import { 
  AlphaSignal, AlphaSignalFeatureBreakdown, FeatureEvidence, 
  TokenMarketData, 
  WalletProfile, 
  SystemSettings, 
  LiveEventItem 
} from '../types';

const MONITORED_PROGRAMS = [
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter Router v6
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium Liquidity Pool v4
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'  // Orca Whirlpool
];

const CORE_MINTS = new Set([
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', // WBTC
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'  // WETH
]);

export const DEFAULT_HELIUS_POLL_INTERVAL_MS = 600000; // 10 minutes

export class HeliusIngestionWorker {
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private processedSignatures: Set<string> = new Set();
  private programIndex: number = 0;
  private isPolling: boolean = false;

  public pollIntervalMs: number = DEFAULT_HELIUS_POLL_INTERVAL_MS;

  // Stats
  public transactionsIngested: number = 0;
  public walletsDiscovered: number = 0;
  public signalsGenerated: number = 0;
  public lastProcessedTimestamp: string = new Date().toISOString();

  private executionSimulator = new RealisticSolanaExecutionSimulator();

  constructor(
    private storage: StorageAdapter,
    private systemSettings: SystemSettings,
    private onNewState?: (update: {
      transactions?: ParsedTransactionRecord[];
      wallets?: WalletProfile[];
      tokens?: TokenMarketData[];
      signals?: AlphaSignal[];
      liveEvent?: LiveEventItem;
    }) => void
  ) {}

  public start(intervalMs: number = DEFAULT_HELIUS_POLL_INTERVAL_MS): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollIntervalMs = intervalMs;
    console.log(`[HeliusIngestionWorker]: Starting automated on-chain ingestion worker (interval: ${intervalMs}ms).`);

    // Run first batch immediately
    this.pollBatch().catch(err => {
      console.warn('[HeliusIngestionWorker] Initial poll error:', err.message);
    });

    this.intervalTimer = setInterval(() => {
      this.pollBatch().catch(err => {
        console.warn('[HeliusIngestionWorker] Poll batch error:', err.message);
      });
    }, intervalMs);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
    console.log('[HeliusIngestionWorker]: Ingestion worker stopped.');
  }

  public getStatus() {
    return {
      running: this.isRunning,
      pollIntervalMs: this.pollIntervalMs,
      transactionsIngested: this.transactionsIngested,
      walletsDiscovered: this.walletsDiscovered,
      signalsGenerated: this.signalsGenerated,
      lastProcessedTimestamp: this.lastProcessedTimestamp
    };
  }

  /**
   * Core Polling & Processing Cycle
   */
  private async pollBatch(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const apiKey = RealDataProviders.getHeliusApiKey();

      // Cycle through monitored DEX programs
      const targetProgram = MONITORED_PROGRAMS[this.programIndex % MONITORED_PROGRAMS.length];
      this.programIndex++;

      const rpcEndpoint = await RealDataProviders.getWorkingSolanaRpcUrl();

      // 1. Fetch recent signatures for monitored DEX program
      const sigRes = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [targetProgram, { limit: 12 }]
        })
      });

      if (!sigRes.ok) {
        return;
      }

      const sigData = await sigRes.json();
      const rawSignatures: any[] = sigData.result || [];
      if (rawSignatures.length === 0) {
        return;
      }

      // Filter out already processed signatures (using local cache & Upstash Redis)
      const newSigs: string[] = [];
      for (const item of rawSignatures) {
        const sig = item.signature;
        if (!sig || this.processedSignatures.has(sig)) continue;

        // Check Redis cache
        const redisKey = `hef:sig:${sig}`;
        const existsInRedis = await RedisClientService.get(redisKey);
        if (existsInRedis) {
          this.processedSignatures.add(sig);
          continue;
        }

        newSigs.push(sig);
        this.processedSignatures.add(sig);
        if (this.processedSignatures.size > 5000) {
          const firstKey = this.processedSignatures.values().next().value;
          if (firstKey) this.processedSignatures.delete(firstKey);
        }

        // Cache in Redis for 12 hours
        await RedisClientService.set(redisKey, '1', 43200).catch(() => {});
      }

      if (newSigs.length === 0) {
        return;
      }

      // 2. Fetch enhanced parsed transactions from Helius (with fallback to direct Solana RPC)
      let rawTxs: any[] = [];
      if (apiKey) {
        try {
          const enhRes = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: newSigs.slice(0, 10) })
          });
          if (enhRes.ok) {
            rawTxs = await enhRes.json();
          }
        } catch {
          // Fall back to Solana RPC below
        }
      }

      if (!Array.isArray(rawTxs) || rawTxs.length === 0) {
        // Direct Solana RPC getTransaction fallback
        for (const sig of newSigs.slice(0, 4)) {
          try {
            const txRes = await fetch(rpcEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [sig, { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]
              })
            });
            if (txRes.ok) {
              const txJson = await txRes.json();
              if (txJson.result) {
                rawTxs.push(HeliusTransactionParser.mapSolanaRpcTransaction(txJson.result, sig));
              }
            }
          } catch {
            // ignore individual RPC errors
          }
        }
      }
      if (!Array.isArray(rawTxs) || rawTxs.length === 0) {
        return;
      }

      // 3. Parse transactions
      const parsedRecords: ParsedTransactionRecord[] = [];
      for (const tx of rawTxs) {
        try {
          const parsed = HeliusTransactionParser.parseTransaction(tx);
          if (parsed && parsed.signature && parsed.walletAddress !== 'UNKNOWN_WALLET') {
            parsedRecords.push(parsed);
          }
        } catch {
          // ignore unparseable
        }
      }

      if (parsedRecords.length === 0) {
        return;
      }

      // 4. Persist transactions
      await this.storage.saveTransactionsBatch(parsedRecords);
      this.transactionsIngested += parsedRecords.length;
      this.lastProcessedTimestamp = new Date().toISOString();

      // Emit live ingestion event
      const sampleTx = parsedRecords[0];
      const tradeSummary = `${sampleTx.tradeDirection} ${sampleTx.tokenOutSymbol || sampleTx.tokenInSymbol} ($${Math.round(sampleTx.usdValue).toLocaleString()})`;
      const ingestionEvent: LiveEventItem = {
        id: `ev-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        category: sampleTx.tradeDirection === 'SELL' ? 'SMART_SELL' : 'SMART_BUY',
        headline: `On-Chain Ingestion: ${sampleTx.dex}`,
        detail: `Verified block transaction ${sampleTx.signature.slice(0, 8)}... by ${sampleTx.walletAddress.slice(0, 6)}: ${tradeSummary}`,
        badgeType: 'info'
      };

      // 5. Discover & evaluate wallets automatically
      const discoveredWallets = await WalletDiscoveryService.discoverWalletsFromActivity(
        rawTxs,
        this.systemSettings,
        this.storage
      );

      if (discoveredWallets.length > 0) {
        this.walletsDiscovered += discoveredWallets.length;
      }

      // 6. Discover traded tokens and generate Alpha Signals
      const discoveredTokens: TokenMarketData[] = [];
      const generatedSignals: AlphaSignal[] = [];

      for (const tx of parsedRecords) {
        // Look for non-core token mints
        const candidateMint = !CORE_MINTS.has(tx.tokenOutAddress) && tx.tokenOutAddress
          ? tx.tokenOutAddress
          : (!CORE_MINTS.has(tx.tokenInAddress) && tx.tokenInAddress ? tx.tokenInAddress : null);

        const candidateSymbol = candidateMint === tx.tokenOutAddress ? tx.tokenOutSymbol : tx.tokenInSymbol;

        if (!candidateMint || candidateSymbol === 'TOKEN_IN' || candidateSymbol === 'TOKEN_OUT') {
          continue;
        }

        // Fetch real-time market quote
        let realPrice = tx.executionPriceUsd;
        try {
          const priceRecord = await RealDataProviders.fetchBirdeyePrice(candidateMint);
          if (priceRecord && priceRecord.priceUsd > 0) {
            realPrice = priceRecord.priceUsd;
          }
        } catch {
          // fallback to tx execution price
        }

        // Resolve Token Metadata
        const metadata = await TokenResolver.resolveToken(candidateMint);
        if (metadata === 'INSUFFICIENT_DATA') {
          console.warn(`[HeliusIngestion] Dropping signal: Insufficient token metadata for ${candidateMint}`);
          continue;
        }

        const tokenData: TokenMarketData = {
          symbol: metadata.symbol,
          name: metadata.name,
          address: metadata.address,
          decimals: metadata.decimals,
          priceUsd: realPrice > 0 ? realPrice : null,
          priceChange1h: null,
          priceChange24h: null,
          volume24hUsd: null,
          liquidityUsd: metadata.liquidityUsd,
          marketCapUsd: null,
          fdvUsd: null,
          holderCount: null,
          tokenAgeDays: null,
          top10HoldersPercent: null,
          top20HoldersPercent: null,
          devHoldingsPercent: null,
          hasFreezeAuthority: !metadata.securityFlags.freezeAuthorityRevoked,
          hasMintAuthority: !metadata.securityFlags.mintAuthorityRevoked,
          liquidityLockedPercent: null,
          isHoneypotSafe: null,
          riskScore: null,
          smartMoneyVwap: null,
          netFlow24hUsd: null
        };

        await this.storage.saveToken(tokenData);
        discoveredTokens.push(tokenData);

        // Generate Alpha Signal if positive flow and significant swap
        if (tx.tradeDirection === 'BUY' && tx.usdValue >= 500) {
          const createMockEvidence = (val: number | null): FeatureEvidence | null => {
            if (val === null) return null;
            return {
              value: val,
              status: ('live_paper') === 'live_paper' ? 'INSUFFICIENT_DATA' : 'MOCK',
              source: 'helius_ingestion_stub',
              timestamp: new Date().toISOString()
            };
          };

          const features: AlphaSignalFeatureBreakdown = {
            traderSkillScore: createMockEvidence(null),
            copyabilityScore: createMockEvidence(null),
            independentConsensusScore: createMockEvidence(null),
            convictionSurpriseScore: createMockEvidence(null),
            smartMoneyAccelerationScore: createMockEvidence(null),
            entryQualityScore: createMockEvidence(null),
            liquidityTokenQualityScore: createMockEvidence(null),
            regimeFitScore: createMockEvidence(null),
            emergingTraderScore: createMockEvidence(null),
            penalties: {
              crowdingPenalty: 0,
              relatedWalletsPenalty: 0,
              poorLiquidityPenalty: 0,
              pricePumpedPenalty: 0,
              suspiciousTokenStructurePenalty: 0,
              highSlippagePenalty: 0,
              traderDeteriorationPenalty: 0,
              insufficientSamplePenalty: 0,
              profitConcentrationPenalty: 0
            },
            totalPenalties: 0
          };

          const { alphaScore, signalState, dataStatus } = AlphaEngine.computeAlphaScore(features, ('live_paper'), this.systemSettings);
          
          let simulatedFill = undefined;
          if (dataStatus === 'COMPLETE') {
             // In real live mode this would only run if evidence is complete.
          }

          const signal: AlphaSignal = {
            id: `sig-live-${candidateMint.slice(0, 6)}-${Date.now()}`,
            tokenSymbol: tokenData.symbol,
            tokenAddress: candidateMint,
            timestamp: new Date().toISOString(),
            alphaScore,
            dataStatus,
            signalState,
            decision: 'WATCHED',
            liquidityUsd: tokenData.liquidityUsd || undefined,
            independentEliteCount: null as any,
            totalSmartMoneyInflowUsd: null as any,
            priceAtSignal: realPrice,
            priceDisplacementFromVwapPercent: null as any,
            currentRegime: null as any,
            features,
            participantWallets: [{
              address: tx.walletAddress,
              qualityScore: null as any,
              convictionMultiplier: null as any,
              tradeUsd: tx.usdValue,
              isIndependent: false
            }],
            historicalExpectancy: {
              similarEventsCount: 0,
              winRatePercent: 0,
              averageWinnerPercent: 0,
              averageLoserPercent: 0,
              medianReturnPercent: 0,
              grossEvPercent: 0,
              executionCostPercent: 0,
              netEvPercent: 0,
              maxFavorableExcursionPercent: 0,
              maxAdverseExcursionPercent: 0,
              return5mPercent: 0,
              return15mPercent: 0,
              return1hPercent: 0,
              return4hPercent: 0,
              return24hPercent: 0
            },
            executionSimulation: simulatedFill
          };

          await this.storage.saveSignal(signal);
          generatedSignals.push(signal);
          this.signalsGenerated++;
        }
      }

      // Notify callback of updates
      if (this.onNewState) {
        this.onNewState({
          transactions: parsedRecords,
          wallets: discoveredWallets,
          tokens: discoveredTokens,
          signals: generatedSignals,
          liveEvent: ingestionEvent
        });
      }
    } catch (err: any) {
      console.warn('[HeliusIngestionWorker] Error in poll cycle:', err.message);
    } finally {
      this.isPolling = false;
    }
  }
}
