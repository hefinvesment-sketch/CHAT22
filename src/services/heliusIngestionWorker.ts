import { TokenResolver, revokedToAuthorityPresent } from './tokenResolver';
import { StorageAdapter } from './persistence';
import { HeliusTransactionParser, ParsedTransactionRecord } from './heliusParser';
import { WalletDiscoveryService } from './walletDiscovery';
import { RealDataProviders } from './realDataProviders';
import { ReferencePriceService } from './referencePriceService';
import { TokenEnrichmentService } from './tokenEnrichmentService';
import { getErrorMessage } from '../utils/errors';
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

export type WorkerStatus = 'RUNNING' | 'HEALTHY' | 'DEGRADED' | 'ERROR';

export class HeliusIngestionWorker {
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private programIndex: number = 0;
  private isPolling: boolean = false;
  public pollIntervalMs: number = DEFAULT_HELIUS_POLL_INTERVAL_MS;

  // Stats
  public status: WorkerStatus = 'HEALTHY';
  public transactionsIngested: number = 0;
  public walletsDiscovered: number = 0;
  public signalsGenerated: number = 0;
  
  public lastPollStartedAt: string | null = null;
  public lastPollCompletedAt: string | null = null;
  public lastSuccessfulIngestionAt: string | null = null;
  public lastErrorAt: string | null = null;
  public lastErrorMessage: string | null = null;
  
  public transactionsLastPoll: number = 0;
  public pagesFetchedLastPoll: number = 0;
  public backlogDetected: boolean = false;

  private appMode: string;

  constructor(
    private storage: StorageAdapter,
    private systemSettings: SystemSettings,
    private onNewState?: (state: {
      transactions: ParsedTransactionRecord[];
      wallets: WalletProfile[];
      tokens: TokenMarketData[];
      signals: AlphaSignal[];
      liveEvent?: LiveEventItem;
    }) => void
  ) {
    this.appMode = process.env.APP_MODE || 'live_paper';
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.status = 'RUNNING';
    console.log('[HeliusIngestionWorker]: Starting ingestion polling...');
    this.pollBatch();
    this.intervalTimer = setInterval(() => this.pollBatch(), this.pollIntervalMs);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
    this.status = 'HEALTHY';
    console.log('[HeliusIngestionWorker]: Ingestion worker stopped.');
  }

  public getStatus() {
    return {
      running: this.isRunning,
      status: this.status,
      pollIntervalMs: this.pollIntervalMs,
      transactionsIngested: this.transactionsIngested,
      walletsDiscovered: this.walletsDiscovered,
      signalsGenerated: this.signalsGenerated,
      lastPollStartedAt: this.lastPollStartedAt,
      lastPollCompletedAt: this.lastPollCompletedAt,
      lastSuccessfulIngestionAt: this.lastSuccessfulIngestionAt,
      lastErrorAt: this.lastErrorAt,
      lastErrorMessage: this.lastErrorMessage,
      transactionsLastPoll: this.transactionsLastPoll,
      pagesFetchedLastPoll: this.pagesFetchedLastPoll,
      backlogDetected: this.backlogDetected
    };
  }

  /**
   * Core Polling & Processing Cycle
   */
  private async pollBatch(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    this.lastPollStartedAt = new Date().toISOString();
    this.transactionsLastPoll = 0;
    this.pagesFetchedLastPoll = 0;
    this.backlogDetected = false;

    try {
      const apiKey = RealDataProviders.getHeliusApiKey();
      const targetProgram = MONITORED_PROGRAMS[this.programIndex % MONITORED_PROGRAMS.length];
      this.programIndex++;
      
      let sourceKey = 'helius:UNKNOWN';
      if (targetProgram === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4') sourceKey = 'helius:JUPITER';
      else if (targetProgram === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') sourceKey = 'helius:RAYDIUM';
      else if (targetProgram === 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc') sourceKey = 'helius:ORCA';
      else sourceKey = `helius:${targetProgram}`;

      const checkpoint = await this.storage.getIngestionCheckpoint(sourceKey);
      const lastSignature = checkpoint?.lastSignature;

      const pageSize = Number(process.env.HELIUS_SIGNATURE_PAGE_SIZE) || 100;
      const maxPages = Number(process.env.HELIUS_MAX_PAGES_PER_POLL) || 10;
      
      const rpcEndpoint = await RealDataProviders.getWorkingSolanaRpcUrl();

      let currentBefore: string | undefined = undefined;
      const fetchedSignatures: string[] = [];
      let reachedCheckpoint = false;
      let pagesFetched = 0;

      while (pagesFetched < maxPages && !reachedCheckpoint) {
        pagesFetched++;
        this.pagesFetchedLastPoll = pagesFetched;
        
        const params: { limit: number; before?: string } = { limit: pageSize };
        if (currentBefore) {
          params.before = currentBefore;
        }

        const sigRes = await fetch(rpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [targetProgram, params]
          })
        });

        if (!sigRes.ok) {
          this.status = 'DEGRADED';
          this.lastErrorMessage = `RPC Error ${sigRes.status}`;
          break;
        }

        const sigData = (await sigRes.json()) as { result?: Array<{ signature?: string }> };
        const rawSignatures = sigData.result || [];

        if (rawSignatures.length === 0) {
          reachedCheckpoint = true;
          break;
        }

        for (const item of rawSignatures) {
          if (!item || !item.signature) continue;
          const sig = item.signature;
          
          if (sig === lastSignature) {
            reachedCheckpoint = true;
            break;
          }
          fetchedSignatures.push(sig);
        }
        
        if (!reachedCheckpoint && rawSignatures.length > 0) {
          currentBefore = rawSignatures[rawSignatures.length - 1]?.signature;
        } else {
          break;
        }
      }

      if (!reachedCheckpoint && pagesFetched >= maxPages) {
        this.backlogDetected = true;
        this.status = 'DEGRADED';
      }

      if (fetchedSignatures.length === 0) {
        this.isPolling = false;
        this.lastPollCompletedAt = new Date().toISOString();
        if (this.status !== 'DEGRADED') this.status = 'HEALTHY';
        return;
      }

      // Reverse chronologically (oldest first)
      fetchedSignatures.reverse();
      
      // Batch process enhanced transactions
      const batchSize = 25;
      const rawTxs: unknown[] = [];
      
      for (let i = 0; i < fetchedSignatures.length; i += batchSize) {
        const batchSigs = fetchedSignatures.slice(i, i + batchSize);
        if (apiKey) {
          try {
            const txRes = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transactions: batchSigs })
            });
            if (txRes.ok) {
              const resJson = await txRes.json();
              if (Array.isArray(resJson)) {
                rawTxs.push(...resJson);
              }
            } else {
              this.status = 'DEGRADED';
            }
          } catch (err) {
            this.status = 'DEGRADED';
            this.lastErrorMessage = getErrorMessage(err);
          }
        }
      }

      if (rawTxs.length === 0) {
        this.isPolling = false;
        this.lastPollCompletedAt = new Date().toISOString();
        return;
      }

      // Parse transactions
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
        this.isPolling = false;
        this.lastPollCompletedAt = new Date().toISOString();
        return;
      }

      // Persist transactions
      await this.storage.saveTransactionsBatch(parsedRecords);
      this.transactionsIngested += parsedRecords.length;
      this.transactionsLastPoll = parsedRecords.length;
      this.lastSuccessfulIngestionAt = new Date().toISOString();
      
      const newestPersisted = parsedRecords[parsedRecords.length - 1];
      if (newestPersisted) {
        try {
          await this.storage.saveIngestionCheckpoint(sourceKey, newestPersisted.signature, newestPersisted.slot || 0);
        } catch (cpErr) {
          console.error(`[Helius Worker CRITICAL]: Failed to save ingestion checkpoint for ${sourceKey}: ${getErrorMessage(cpErr)}`);
          this.status = 'DEGRADED';
          this.lastErrorMessage = `Checkpoint save failure: ${getErrorMessage(cpErr)}`;
          this.isPolling = false;
          this.lastPollCompletedAt = new Date().toISOString();
          return;
        }
      }

      // Emit live ingestion event
      const sampleTx = parsedRecords[0];
      const tradeSummary = sampleTx ? `${sampleTx.tradeDirection} ${sampleTx.tokenOutSymbol || sampleTx.tokenInSymbol} ($${Math.round(sampleTx.usdValue).toLocaleString()})` : '';
      const ingestionEvent: LiveEventItem = {
        id: `ev-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        category: sampleTx?.tradeDirection === 'SELL' ? 'DEX_SELL_OBSERVED' : 'DEX_BUY_OBSERVED',
        headline: `On-Chain Observation: ${sampleTx?.dex || 'DEX'}`,
        detail: sampleTx ? `Verified block transaction ${sampleTx.signature.slice(0, 8)}... by ${sampleTx.walletAddress.slice(0, 6)}: ${tradeSummary}` : 'Verified block transaction batch',
        badgeType: 'info'
      };

      // Discover & evaluate wallets automatically
      const discoveredWallets = await WalletDiscoveryService.discoverWalletsFromActivity(
        rawTxs,
        this.systemSettings,
        this.storage
      );
      if (discoveredWallets.length > 0) {
        this.walletsDiscovered += discoveredWallets.length;
      }

      // Discover traded tokens and generate Alpha Signals
      const discoveredTokens: TokenMarketData[] = [];
      const generatedSignals: AlphaSignal[] = [];

      for (const tx of parsedRecords) {
        const candidateMint = !CORE_MINTS.has(tx.tokenOutAddress) && tx.tokenOutAddress
          ? tx.tokenOutAddress
          : (!CORE_MINTS.has(tx.tokenInAddress) && tx.tokenInAddress ? tx.tokenInAddress : null);
          
        if (!candidateMint) {
          continue;
        }

        let realPrice = tx.executionPriceUsd;
        try {
          const priceRecord = await ReferencePriceService.getPrice(candidateMint);
          if (priceRecord && priceRecord.priceUsd && priceRecord.priceUsd > 0) {
            realPrice = priceRecord.priceUsd;
          }
        } catch {
          // fallback to tx execution price
        }

        // Resolve Token Metadata
        const metadata = await TokenResolver.resolveToken(candidateMint);

        const tokenData: TokenMarketData = {
          symbol: metadata.symbol,
          name: metadata.name || 'Unknown Token',
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
          hasFreezeAuthority: revokedToAuthorityPresent(metadata.securityFlags?.freezeAuthorityRevoked),
          hasMintAuthority: revokedToAuthorityPresent(metadata.securityFlags?.mintAuthorityRevoked),
          liquidityLockedPercent: null,
          isHoneypotSafe: null,
          riskScore: null,
          smartMoneyVwap: null,
          netFlow24hUsd: null
        };
        await this.storage.saveToken(tokenData);
        discoveredTokens.push(tokenData);
        
        // Queue asynchronous enrichment with Birdeye/DEXScreener to avoid blocking ingestion loop
        TokenEnrichmentService.enrichTokenIfNeeded(candidateMint, this.storage).catch(console.error);

        if (tx.tradeDirection === 'BUY' && tx.usdValue >= 500) {
          const createInsufficientEvidence = (val: number | null): FeatureEvidence<number> | null => {
            if (val === null) return null;
            return {
              value: val,
              status: 'INSUFFICIENT_DATA',
              source: 'helius_ingestion_stub',
              timestamp: new Date().toISOString()
            };
          };

          const features: AlphaSignalFeatureBreakdown = {
            traderSkillScore: createInsufficientEvidence(null),
            copyabilityScore: createInsufficientEvidence(null),
            independentConsensusScore: createInsufficientEvidence(null),
            convictionSurpriseScore: createInsufficientEvidence(null),
            smartMoneyAccelerationScore: createInsufficientEvidence(null),
            entryQualityScore: createInsufficientEvidence(null),
            liquidityTokenQualityScore: createInsufficientEvidence(null),
            regimeFitScore: createInsufficientEvidence(null),
            emergingTraderScore: createInsufficientEvidence(null),
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

          const alphaScore = null;
          const signalState = 'WATCH';
          const dataStatus = 'INSUFFICIENT_DATA';
          
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
            independentEliteCount: null,
            totalSmartMoneyInflowUsd: null,
            priceAtSignal: realPrice,
            priceDisplacementFromVwapPercent: null,
            currentRegime: null,
            features,
            participantWallets: [{
              address: tx.walletAddress,
              qualityScore: null,
              convictionMultiplier: null,
              tradeUsd: tx.usdValue,
              independenceStatus: 'UNKNOWN'
            }],
            historicalExpectancy: {
              similarEventsCount: 0,
              winRatePercent: null,
              averageWinnerPercent: null,
              averageLoserPercent: null,
              medianReturnPercent: null,
              grossEvPercent: null,
              executionCostPercent: null,
              netEvPercent: null,
              maxFavorableExcursionPercent: null,
              maxAdverseExcursionPercent: null,
              return5mPercent: null,
              return15mPercent: null,
              return1hPercent: null,
              return4hPercent: null,
              return24hPercent: null, 
              dataStatus: "INSUFFICIENT_SAMPLE" 
            },
            executionSimulation: undefined
          };
          await this.storage.saveSignal(signal);
          generatedSignals.push(signal);
          this.signalsGenerated++;
        }
      }

      if (this.onNewState) {
        this.onNewState({
          transactions: parsedRecords,
          wallets: discoveredWallets,
          tokens: discoveredTokens,
          signals: generatedSignals,
          liveEvent: ingestionEvent
        });
      }

      this.lastPollCompletedAt = new Date().toISOString();
      if (!this.backlogDetected && this.status !== 'DEGRADED') {
        this.status = 'HEALTHY';
      }
    } catch (err) {
      this.status = 'ERROR';
      this.lastErrorAt = new Date().toISOString();
      this.lastErrorMessage = getErrorMessage(err);
      console.warn('[HeliusIngestionWorker] Error in poll cycle:', getErrorMessage(err));
    } finally {
      this.isPolling = false;
    }
  }
}
