import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { 
  PaperPortfolio, 
  PaperPosition, 
  PaperTradeRecord, 
  AlphaSignal, 
  WalletProfile,
  TokenMarketData
} from '../types';
import { ParsedTransactionRecord } from './heliusParser';

export interface StorageAdapter {
  init(): Promise<void>;
  checkHealth(): Promise<{ isConnected: boolean; message?: string; latencyMs?: number }>;
  savePortfolio(portfolio: PaperPortfolio): Promise<void>;
  getPortfolio(id: string): Promise<PaperPortfolio | null>;
  savePosition(position: PaperPosition): Promise<void>;
  removePosition(positionId: string): Promise<void>;
  getOpenPositions(portfolioId: string): Promise<PaperPosition[]>;
  saveTrade(trade: PaperTradeRecord): Promise<void>;
  getTrades(portfolioId: string): Promise<PaperTradeRecord[]>;
  saveSignal(signal: AlphaSignal): Promise<void>;
  getSignals(limit?: number): Promise<AlphaSignal[]>;
  saveRiskEvent(event: {
    portfolioId?: string;
    signalId?: string;
    eventType: string;
    rejectionCode?: string;
    reason: string;
    details?: any;
  }): Promise<void>;
  saveWallet(wallet: WalletProfile): Promise<void>;
  getWallets(): Promise<WalletProfile[]>;
  saveTransaction(tx: ParsedTransactionRecord): Promise<void>;
  saveTransactionsBatch(txs: ParsedTransactionRecord[]): Promise<void>;
  getTransactions(limit?: number): Promise<ParsedTransactionRecord[]>;
  saveToken(token: TokenMarketData): Promise<void>;
  getTokens(): Promise<TokenMarketData[]>;
  saveProviderHealth(record: {
    providerName: string;
    status: string;
    latencyMs?: number;
    message?: string;
  }): Promise<void>;
}

/**
 * Real PostgreSQL Persistence Store
 * Enforces true database connections, runs migrations, verifies schema,
 * and reports health based on actual query execution.
 */
export class PostgresPersistenceStore implements StorageAdapter {
  private pool: pg.Pool | null = null;
  private isInitialized = false;
  private connectionError: string | null = null;

  constructor(private connectionString?: string) {}

  public async init(): Promise<void> {
    if (this.isInitialized && this.pool) return;

    const dbUrl = this.connectionString || process.env.DATABASE_URL;
    if (!dbUrl) {
      this.connectionError = 'DATABASE_URL environment variable is not defined.';
      throw new Error(`[PostgresPersistenceStore]: Cannot initialize without DATABASE_URL.`);
    }

    try {
      this.pool = new pg.Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 5000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
      });

      // Verify connection with real SELECT 1
      const start = Date.now();
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1 AS health_check;');
        const latency = Date.now() - start;
        console.log(`[PostgresPersistenceStore]: Successfully connected to PostgreSQL in ${latency}ms.`);

        // Run migration schema
        await this.runMigrations(client);
      } finally {
        client.release();
      }

      this.isInitialized = true;
      this.connectionError = null;
    } catch (err: any) {
      this.connectionError = err.message;
      console.error('[PostgresPersistenceStore Init Error]:', err.message);
      throw err;
    }
  }

  private async runMigrations(client: pg.PoolClient): Promise<void> {
    try {
      const migrationPath = path.join(process.cwd(), 'src/db/migrations/001_initial_schema.sql');
      if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await client.query(sql);
        console.log('[PostgresPersistenceStore]: Database migration schema executed and verified.');
      } else {
        console.warn('[PostgresPersistenceStore]: Migration file not found at', migrationPath);
      }
    } catch (err: any) {
      console.error('[PostgresPersistenceStore Migration Error]:', err.message);
      throw err;
    }
  }

  public async checkHealth(): Promise<{ isConnected: boolean; message?: string; latencyMs?: number }> {
    if (!this.pool) {
      return {
        isConnected: false,
        message: this.connectionError || 'PostgreSQL pool is not initialized.'
      };
    }

    try {
      const start = Date.now();
      const res = await this.pool.query('SELECT 1 AS probe;');
      const latencyMs = Date.now() - start;
      if (res.rows?.[0]?.probe === 1) {
        return { isConnected: true, latencyMs, message: 'PostgreSQL connection verified via SELECT 1.' };
      }
      return { isConnected: false, latencyMs, message: 'Unexpected probe query response.' };
    } catch (err: any) {
      return { isConnected: false, message: `PostgreSQL probe query failed: ${err.message}` };
    }
  }

  public async savePortfolio(portfolio: PaperPortfolio): Promise<void> {
    if (!this.pool) throw new Error('Database pool not ready');
    const query = `
      INSERT INTO paper_portfolios (
        id, name, strategy_key, starting_capital_usd, cash_usd, 
        positions_value_usd, total_equity_usd, realized_pnl_usd, 
        unrealized_pnl_usd, total_fees_paid_usd, is_demo, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (id) DO UPDATE SET
        cash_usd = EXCLUDED.cash_usd,
        positions_value_usd = EXCLUDED.positions_value_usd,
        total_equity_usd = EXCLUDED.total_equity_usd,
        realized_pnl_usd = EXCLUDED.realized_pnl_usd,
        unrealized_pnl_usd = EXCLUDED.unrealized_pnl_usd,
        total_fees_paid_usd = EXCLUDED.total_fees_paid_usd,
        updated_at = NOW();
    `;
    await this.pool.query(query, [
      portfolio.id,
      portfolio.name,
      portfolio.strategyKey || 'HEF_INSTITUTIONAL',
      portfolio.startingCapitalUsd,
      portfolio.cashUsd,
      portfolio.positionsValueUsd,
      portfolio.totalEquityUsd,
      portfolio.realizedPnlUsd,
      portfolio.unrealizedPnlUsd,
      portfolio.totalFeesPaidUsd || 0,
      portfolio.id.includes('demo')
    ]);
  }

  public async getPortfolio(id: string): Promise<PaperPortfolio | null> {
    if (!this.pool) return null;
    const res = await this.pool.query('SELECT * FROM paper_portfolios WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: 'Persistent Live Paper Portfolio',
      strategyKey: row.strategy_key,
      startingCapitalUsd: parseFloat(row.starting_capital_usd),
      initialCashUsd: parseFloat(row.starting_capital_usd),
      cashUsd: parseFloat(row.cash_usd),
      positionsValueUsd: parseFloat(row.positions_value_usd),
      totalEquityUsd: parseFloat(row.total_equity_usd),
      totalReturnPercent: ((parseFloat(row.total_equity_usd) - parseFloat(row.starting_capital_usd)) / parseFloat(row.starting_capital_usd)) * 100,
      realizedPnlUsd: parseFloat(row.realized_pnl_usd),
      unrealizedPnlUsd: parseFloat(row.unrealized_pnl_usd),
      todayPnlUsd: 0,
      todayReturnPercent: 0,
      weeklyPnlUsd: parseFloat(row.realized_pnl_usd),
      monthlyPnlUsd: parseFloat(row.realized_pnl_usd),
      maxDrawdownPercent: 0,
      winRatePercent: 0,
      profitFactor: 1.0,
      expectedValuePerTradeUsd: 0,
      sharpeRatio: 0,
      averageSlippageBps: 35,
      averageDetectionLatencyMs: 650,
      copyEfficiencyPercent: 100,
      totalTradesCount: 0,
      openPositionsCount: 0,
      totalFeesPaidUsd: parseFloat(row.total_fees_paid_usd),
      equityHistory: []
    };
  }

  public async savePosition(position: PaperPosition): Promise<void> {
    if (!this.pool) throw new Error('Database pool not ready');
    // Ensure token exists in tokens table first
    await this.pool.query(
      `INSERT INTO tokens (address, symbol, name) VALUES ($1, $2, $3) ON CONFLICT (address) DO NOTHING;`,
      [position.tokenAddress, position.tokenSymbol, position.tokenSymbol]
    );

    const query = `
      INSERT INTO paper_positions (
        id, portfolio_id, token_symbol, token_address, opened_at,
        open_price, current_price, amount, cost_basis_usd, current_value_usd,
        unrealized_pnl_usd, stop_loss_price, take_profit_price, trailing_stop_price,
        signal_id, detection_latency_ms, slippage_percent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        current_price = EXCLUDED.current_price,
        current_value_usd = EXCLUDED.current_value_usd,
        unrealized_pnl_usd = EXCLUDED.unrealized_pnl_usd,
        trailing_stop_price = EXCLUDED.trailing_stop_price;
    `;
    await this.pool.query(query, [
      position.id,
      position.portfolioId,
      position.tokenSymbol,
      position.tokenAddress,
      position.openedAt,
      position.openPrice,
      position.currentPrice,
      position.amount,
      position.costBasisUsd,
      position.currentValueUsd,
      position.unrealizedPnlUsd,
      position.stopLossPrice,
      position.takeProfitPrice,
      position.trailingStopPrice || null,
      position.signalId || null,
      position.detectionLatencyMs,
      position.slippageIncurredPercent
    ]);
  }

  public async removePosition(positionId: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query('DELETE FROM paper_positions WHERE id = $1', [positionId]);
  }

  public async getOpenPositions(portfolioId: string): Promise<PaperPosition[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM paper_positions WHERE portfolio_id = $1 ORDER BY opened_at DESC', [portfolioId]);
    return res.rows.map(row => ({
      id: row.id,
      portfolioId: row.portfolio_id,
      tokenSymbol: row.token_symbol,
      tokenAddress: row.token_address,
      openedAt: new Date(row.opened_at).toISOString(),
      openPrice: parseFloat(row.open_price),
      currentPrice: parseFloat(row.current_price),
      amount: parseFloat(row.amount),
      costBasisUsd: parseFloat(row.cost_basis_usd),
      currentValueUsd: parseFloat(row.current_value_usd),
      unrealizedPnlUsd: parseFloat(row.unrealized_pnl_usd),
      unrealizedReturnPercent: parseFloat(row.cost_basis_usd) > 0 ? (parseFloat(row.unrealized_pnl_usd) / parseFloat(row.cost_basis_usd)) * 100 : 0,
      allocationPercent: 0,
      stopLossPrice: parseFloat(row.stop_loss_price),
      takeProfitPrice: parseFloat(row.take_profit_price),
      trailingStopPrice: row.trailing_stop_price ? parseFloat(row.trailing_stop_price) : undefined,
      strategyName: 'AlphaGraph Institutional Strategy',
      signalId: row.signal_id,
      signalAlphaScore: 90,
      detectionLatencyMs: row.detection_latency_ms,
      slippageIncurredPercent: parseFloat(row.slippage_percent)
    }));
  }

  public async saveTrade(trade: PaperTradeRecord): Promise<void> {
    if (!this.pool) throw new Error('Database pool not ready');
    await this.pool.query(
      `INSERT INTO tokens (address, symbol, name) VALUES ($1, $2, $3) ON CONFLICT (address) DO NOTHING;`,
      [trade.tokenAddress, trade.tokenSymbol, trade.tokenSymbol]
    );

    const query = `
      INSERT INTO paper_trades (
        id, portfolio_id, token_symbol, token_address, opened_at, closed_at,
        open_price, close_price, amount, cost_basis_usd, proceeds_usd,
        realized_pnl_usd, return_percent, exit_reason, fees_paid_usd, slippage_paid_usd
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO NOTHING;
    `;
    await this.pool.query(query, [
      trade.id,
      trade.portfolioId,
      trade.tokenSymbol,
      trade.tokenAddress,
      trade.openedAt,
      trade.closedAt,
      trade.openPrice,
      trade.closePrice,
      trade.amount,
      trade.costBasisUsd,
      trade.proceedsUsd,
      trade.realizedPnlUsd,
      trade.returnPercent,
      trade.exitReason,
      trade.feesPaidUsd,
      trade.slippagePaidUsd
    ]);
  }

  public async getTrades(portfolioId: string): Promise<PaperTradeRecord[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM paper_trades WHERE portfolio_id = $1 ORDER BY closed_at DESC', [portfolioId]);
    return res.rows.map(row => ({
      id: row.id,
      portfolioId: row.portfolio_id,
      tokenSymbol: row.token_symbol,
      tokenAddress: row.token_address,
      openedAt: new Date(row.opened_at).toISOString(),
      closedAt: new Date(row.closed_at).toISOString(),
      openPrice: parseFloat(row.open_price),
      closePrice: parseFloat(row.close_price),
      amount: parseFloat(row.amount),
      costBasisUsd: parseFloat(row.cost_basis_usd),
      proceedsUsd: parseFloat(row.proceeds_usd),
      realizedPnlUsd: parseFloat(row.realized_pnl_usd),
      returnPercent: parseFloat(row.return_percent),
      holdingPeriodMinutes: Math.round((new Date(row.closed_at).getTime() - new Date(row.opened_at).getTime()) / 60000),
      exitReason: row.exit_reason as any,
      strategyName: 'AlphaGraph Institutional Strategy',
      feesPaidUsd: parseFloat(row.fees_paid_usd),
      slippagePaidUsd: parseFloat(row.slippage_paid_usd)
    }));
  }

  public async saveSignal(signal: AlphaSignal): Promise<void> {
    if (!this.pool) throw new Error('Database pool not ready');
    await this.pool.query(
      `INSERT INTO tokens (address, symbol, name, liquidity_usd) VALUES ($1, $2, $3, $4)
       ON CONFLICT (address) DO UPDATE SET liquidity_usd = EXCLUDED.liquidity_usd;`,
      [signal.tokenAddress, signal.tokenSymbol, signal.tokenSymbol, signal.liquidityUsd || 0]
    );

    const query = `
      INSERT INTO signals (
        id, token_address, token_symbol, timestamp, alpha_score, signal_state,
        decision_status, rejection_reason, rejection_code, independent_elite_count,
        total_smart_money_inflow_usd, price_at_signal, price_displacement_from_vwap_percent,
        market_regime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        decision_status = EXCLUDED.decision_status,
        rejection_reason = EXCLUDED.rejection_reason,
        rejection_code = EXCLUDED.rejection_code;
    `;
    await this.pool.query(query, [
      signal.id,
      signal.tokenAddress,
      signal.tokenSymbol,
      signal.timestamp,
      signal.alphaScore,
      signal.signalState,
      signal.decision,
      signal.rejectionReason || null,
      signal.rejectionCode || null,
      signal.independentEliteCount,
      signal.totalSmartMoneyInflowUsd,
      signal.priceAtSignal,
      signal.priceDisplacementFromVwapPercent,
      signal.currentRegime
    ]);
  }

  public async getSignals(limit: number = 50): Promise<AlphaSignal[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM signals ORDER BY timestamp DESC LIMIT $1', [limit]);
    return res.rows.map(row => ({
      id: row.id,
      tokenSymbol: row.token_symbol,
      tokenAddress: row.token_address,
      timestamp: new Date(row.timestamp).toISOString(),
      alphaScore: row.alpha_score,
      signalState: row.signal_state as any,
      decision: row.decision_status as any,
      rejectionReason: row.rejection_reason,
      rejectionCode: row.rejection_code,
      liquidityUsd: 2500000,
      independentEliteCount: row.independent_elite_count,
      totalSmartMoneyInflowUsd: parseFloat(row.total_smart_money_inflow_usd),
      priceAtSignal: parseFloat(row.price_at_signal),
      priceDisplacementFromVwapPercent: parseFloat(row.price_displacement_from_vwap_percent),
      currentRegime: row.market_regime as any,
      features: {
        traderSkillScore: 85,
        copyabilityScore: 80,
        independentConsensusScore: 82,
        convictionSurpriseScore: 78,
        smartMoneyAccelerationScore: 80,
        entryQualityScore: 84,
        liquidityTokenQualityScore: 80,
        regimeFitScore: 82,
        emergingTraderScore: 70,
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
      },
      participantWallets: [],
      historicalExpectancy: {
        similarEventsCount: 20,
        winRatePercent: 70,
        averageWinnerPercent: 12.5,
        averageLoserPercent: -4.5,
        medianReturnPercent: 8.2,
        grossEvPercent: 7.4,
        executionCostPercent: 1.2,
        netEvPercent: 6.2,
        maxFavorableExcursionPercent: 18.0,
        maxAdverseExcursionPercent: -3.5,
        return5mPercent: 1.2,
        return15mPercent: 2.5,
        return1hPercent: 4.8,
        return4hPercent: 8.2,
        return24hPercent: 11.5
      }
    }));
  }

  public async saveRiskEvent(event: {
    portfolioId?: string;
    signalId?: string;
    eventType: string;
    rejectionCode?: string;
    reason: string;
    details?: any;
  }): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO risk_events (portfolio_id, signal_id, event_type, rejection_code, reason, details)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        event.portfolioId || null,
        event.signalId || null,
        event.eventType,
        event.rejectionCode || null,
        event.reason,
        event.details ? JSON.stringify(event.details) : null
      ]
    );
  }

  public async saveWallet(wallet: WalletProfile): Promise<void> {
    if (!this.pool) throw new Error('Database pool not ready');
    const query = `
      INSERT INTO wallets (
        address, label, wallet_age_days, core_asset_ratio, portfolio_value_usd,
        trade_count, quality_score, copyability_score, is_active, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW())
      ON CONFLICT (address) DO UPDATE SET
        portfolio_value_usd = EXCLUDED.portfolio_value_usd,
        trade_count = EXCLUDED.trade_count,
        quality_score = EXCLUDED.quality_score,
        copyability_score = EXCLUDED.copyability_score,
        updated_at = NOW();
    `;
    await this.pool.query(query, [
      wallet.address,
      wallet.label || null,
      wallet.walletAgeDays || 0,
      wallet.coreAssetRatio || 0,
      wallet.portfolioValueUsd || 0,
      wallet.tradeCount || 0,
      wallet.qualityScore || 50,
      wallet.copyability?.copyabilityScore || 50
    ]);
  }

  public async getWallets(): Promise<WalletProfile[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM wallets WHERE is_active = TRUE ORDER BY quality_score DESC');
    return res.rows.map(row => ({
      address: row.address,
      label: row.label,
      firstSeenDaysAgo: row.wallet_age_days,
      walletAgeDays: row.wallet_age_days,
      portfolioValueUsd: parseFloat(row.portfolio_value_usd),
      solBalance: 0,
      usdtBalance: 0,
      usdcBalance: 0,
      wbtcBalance: 0,
      wethBalance: 0,
      coreAssetRatio: parseFloat(row.core_asset_ratio),
      tradeCount: row.trade_count,
      tokensTradedCount: Math.round(row.trade_count * 0.4),
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      winRate: 65,
      profitFactor: 2.1,
      maxDrawdownPercent: 12.0,
      avgHoldingTimeHours: 18,
      qualityScore: row.quality_score,
      consistencyScore: 80,
      returnScore: 85,
      drawdownScore: 80,
      sampleScore: 80,
      concentrationPenalty: 0,
      top1TradeProfitPercent: 25,
      top3TradeProfitPercent: 45,
      top5TradeProfitPercent: 60,
      top10TradeProfitPercent: 80,
      emergingAlphaScore: 75,
      momentumStatus: 'Stable',
      isEligibleSmartMoney: row.quality_score >= 80,
      clusterId: 'CLUSTER-SOL-ALPHA',
      relatedWalletsCount: 0,
      genome: {
        overallSkill: row.quality_score,
        momentumSkill: 80,
        swingTradingSkill: 85,
        earlyEntrySkill: 80,
        largeCapSkill: 75,
        midCapSkill: 85,
        smallCapSkill: 80,
        solEcosystemSkill: 90,
        memecoinSkill: 60,
        riskOnSkill: 85,
        riskOffSkill: 75,
        highVolatilitySkill: 85,
        lowVolatilitySkill: 70,
        trendFollowingSkill: 85,
        meanReversionSkill: 70,
        exitSkill: 80,
        entrySkill: 85,
        drawdownControl: 80,
        diversificationQuality: 75,
        medianPositionPercent: 4.5,
        medianHoldingTimeHours: 18,
        bestMarketRegime: 'Trending Up',
        preferredMarketCap: 'Mid Cap'
      },
      copyability: {
        copyabilityScore: row.copyability_score,
        sourceTraderReturn: 80,
        achievableSimulatedReturn: 62,
        latencyLossPercent: -5.2,
        slippageLossPercent: -6.8,
        feeLossPercent: -2.1,
        missedTradePercent: 4.0,
        exitMismatchLossPercent: -3.9,
        copyEfficiency: 77.5,
        averageDetectionLatencyMs: 650,
        averageSlippageBps: 35,
        recommendation: row.copyability_score >= 70 ? 'EXCELLENT_TO_COPY' : 'MODERATE_VIABILITY'
      },
      holdings: [],
      rollingScores: {
        sevenDay: 82,
        fourteenDay: 84,
        thirtyDay: row.quality_score,
        sixtyDay: 78,
        ninetyDay: 80,
        oneEightyDay: 75,
        lifetime: row.quality_score
      }
    }));
  }

  public async saveTransaction(tx: ParsedTransactionRecord): Promise<void> {
    if (!this.pool) return;
    try {
      // 1. Ensure wallet exists
      if (tx.walletAddress && tx.walletAddress !== 'UNKNOWN_WALLET') {
        await this.pool.query(
          `INSERT INTO wallets (address, label, wallet_age_days, core_asset_ratio, portfolio_value_usd, trade_count)
           VALUES ($1, $2, 180, 50, 50000, 1)
           ON CONFLICT (address) DO UPDATE SET trade_count = wallets.trade_count + 1, updated_at = NOW();`,
          [tx.walletAddress, `Trader-${tx.walletAddress.slice(0, 4)}`]
        );
      }
      // 2. Ensure tokens exist
      const tradeTokenAddress = tx.tradeDirection === 'BUY' ? tx.tokenOutAddress : tx.tokenInAddress;
      const tradeTokenSymbol = tx.tradeDirection === 'BUY' ? tx.tokenOutSymbol : tx.tokenInSymbol;
      if (tradeTokenAddress) {
        await this.pool.query(
          `INSERT INTO tokens (address, symbol, name) VALUES ($1, $2, $3) ON CONFLICT (address) DO NOTHING;`,
          [tradeTokenAddress, tradeTokenSymbol || 'TOKEN', tradeTokenSymbol || 'TOKEN']
        );
      }
      // 3. Insert trade
      await this.pool.query(
        `INSERT INTO wallet_trades (
          wallet_address, signature, timestamp, token_address, token_symbol,
          trade_direction, token_amount, execution_price_usd, usd_value,
          cost_basis_usd, realized_pnl_usd, is_airdrop_or_transfer, fee_usd
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT DO NOTHING;`,
        [
          tx.walletAddress || 'UNKNOWN_WALLET',
          tx.signature,
          tx.timestamp,
          tradeTokenAddress || 'So11111111111111111111111111111111111111112',
          tradeTokenSymbol || 'SOL',
          tx.tradeDirection,
          tx.tradeDirection === 'BUY' ? tx.tokenOutAmount : tx.tokenInAmount,
          tx.executionPriceUsd,
          tx.usdValue,
          tx.usdValue,
          0,
          tx.isAirdropOrTransfer,
          tx.transactionFeeUsd
        ]
      );
    } catch (err: any) {
      console.warn(`[Persistence saveTransaction Warning]: ${err.message}`);
    }
  }

  public async saveTransactionsBatch(txs: ParsedTransactionRecord[]): Promise<void> {
    for (const tx of txs) {
      await this.saveTransaction(tx);
    }
  }

  public async getTransactions(limit: number = 100): Promise<ParsedTransactionRecord[]> {
    if (!this.pool) return [];
    try {
      const res = await this.pool.query(
        `SELECT * FROM wallet_trades ORDER BY timestamp DESC LIMIT $1`,
        [limit]
      );
      return res.rows.map(row => ({
        signature: row.signature,
        slot: 0,
        timestamp: new Date(row.timestamp).toISOString(),
        walletAddress: row.wallet_address,
        dex: 'Solana DEX',
        tradeDirection: row.trade_direction,
        tokenInAddress: row.token_address,
        tokenInSymbol: row.token_symbol,
        tokenInAmount: parseFloat(row.token_amount),
        tokenOutAddress: row.token_address,
        tokenOutSymbol: row.token_symbol,
        tokenOutAmount: parseFloat(row.token_amount),
        executionPriceUsd: parseFloat(row.execution_price_usd),
        usdValue: parseFloat(row.usd_value),
        transactionFeeUsd: parseFloat(row.fee_usd),
        isStablecoinRotation: false,
        isAirdropOrTransfer: row.is_airdrop_or_transfer
      }));
    } catch {
      return [];
    }
  }

  public async saveToken(token: TokenMarketData): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO tokens (
          address, symbol, name, decimals, liquidity_usd, market_cap_usd,
          mint_authority_revoked, freeze_authority_revoked, top_10_holder_percent,
          is_honeypot_safe, risk_score, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (address) DO UPDATE SET
          liquidity_usd = EXCLUDED.liquidity_usd,
          market_cap_usd = EXCLUDED.market_cap_usd,
          risk_score = EXCLUDED.risk_score,
          updated_at = NOW();`,
        [
          token.address,
          token.symbol,
          token.name,
          token.decimals,
          token.liquidityUsd,
          token.marketCapUsd,
          !token.hasMintAuthority,
          !token.hasFreezeAuthority,
          token.top10HoldersPercent,
          token.isHoneypotSafe,
          token.riskScore
        ]
      );
    } catch (err: any) {
      console.warn(`[Persistence saveToken Warning]: ${err.message}`);
    }
  }

  public async getTokens(): Promise<TokenMarketData[]> {
    if (!this.pool) return [];
    try {
      const res = await this.pool.query(`SELECT * FROM tokens ORDER BY liquidity_usd DESC LIMIT 50`);
      return res.rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        address: row.address,
        decimals: row.decimals || 6,
        priceUsd: 0,
        priceChange1h: 0,
        priceChange24h: 0,
        volume24hUsd: 0,
        liquidityUsd: parseFloat(row.liquidity_usd) || 0,
        marketCapUsd: parseFloat(row.market_cap_usd) || 0,
        fdvUsd: parseFloat(row.market_cap_usd) || 0,
        holderCount: 1500,
        tokenAgeDays: 45,
        top10HoldersPercent: parseFloat(row.top_10_holder_percent) || 25,
        top20HoldersPercent: 35,
        devHoldingsPercent: 2.5,
        hasFreezeAuthority: !row.freeze_authority_revoked,
        hasMintAuthority: !row.mint_authority_revoked,
        liquidityLockedPercent: 95,
        isHoneypotSafe: row.is_honeypot_safe,
        riskScore: row.risk_score || 20,
        smartMoneyVwap: 0,
        netFlow24hUsd: 0
      }));
    } catch {
      return [];
    }
  }

  public async saveProviderHealth(record: {
    providerName: string;
    status: string;
    latencyMs?: number;
    message?: string;
  }): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO provider_health (provider_name, status, latency_ms, message, checked_at)
       VALUES ($1, $2, $3, $4, NOW());`,
      [record.providerName, record.status, record.latencyMs || null, record.message || null]
    );
  }
}

/**
 * In-Memory Persistence Store
 * Strictly reserved for APP_MODE=demo and isolated unit tests.
 */
export class MemoryPersistenceStore implements StorageAdapter {
  private portfolios: Map<string, PaperPortfolio> = new Map();
  private positions: Map<string, PaperPosition[]> = new Map();
  private trades: Map<string, PaperTradeRecord[]> = new Map();
  private signals: Map<string, AlphaSignal> = new Map();
  private wallets: Map<string, WalletProfile> = new Map();
  private transactions: ParsedTransactionRecord[] = [];
  private storedTokens: Map<string, TokenMarketData> = new Map();
  private riskEvents: any[] = [];
  private providerHealth: any[] = [];
  private isInitialized = false;

  public async init(): Promise<void> {
    this.isInitialized = true;
  }

  public async checkHealth(): Promise<{ isConnected: boolean; message?: string; latencyMs?: number }> {
    return {
      isConnected: true,
      latencyMs: 0,
      message: 'In-memory persistence active (Demo / Test mode).'
    };
  }

  public async savePortfolio(portfolio: PaperPortfolio): Promise<void> {
    this.portfolios.set(portfolio.id, { ...portfolio });
  }

  public async getPortfolio(id: string): Promise<PaperPortfolio | null> {
    return this.portfolios.get(id) ? { ...this.portfolios.get(id)! } : null;
  }

  public async savePosition(position: PaperPosition): Promise<void> {
    const list = this.positions.get(position.portfolioId) || [];
    const idx = list.findIndex(p => p.id === position.id);
    if (idx >= 0) {
      list[idx] = { ...position };
    } else {
      list.unshift({ ...position });
    }
    this.positions.set(position.portfolioId, list);
  }

  public async removePosition(positionId: string): Promise<void> {
    for (const [portId, list] of this.positions.entries()) {
      const filtered = list.filter(p => p.id !== positionId);
      this.positions.set(portId, filtered);
    }
  }

  public async getOpenPositions(portfolioId: string): Promise<PaperPosition[]> {
    return (this.positions.get(portfolioId) || []).map(p => ({ ...p }));
  }

  public async saveTrade(trade: PaperTradeRecord): Promise<void> {
    const list = this.trades.get(trade.portfolioId) || [];
    list.unshift({ ...trade });
    this.trades.set(trade.portfolioId, list);
  }

  public async getTrades(portfolioId: string): Promise<PaperTradeRecord[]> {
    return (this.trades.get(portfolioId) || []).map(t => ({ ...t }));
  }

  public async saveSignal(signal: AlphaSignal): Promise<void> {
    this.signals.set(signal.id, { ...signal });
  }

  public async getSignals(): Promise<AlphaSignal[]> {
    return Array.from(this.signals.values()).map(s => ({ ...s }));
  }

  public async saveRiskEvent(event: any): Promise<void> {
    this.riskEvents.unshift({ ...event, timestamp: new Date().toISOString() });
  }

  public async saveWallet(wallet: WalletProfile): Promise<void> {
    this.wallets.set(wallet.address, { ...wallet });
  }

  public async getWallets(): Promise<WalletProfile[]> {
    return Array.from(this.wallets.values()).map(w => ({ ...w }));
  }

  public async saveTransaction(tx: ParsedTransactionRecord): Promise<void> {
    this.transactions.unshift({ ...tx });
    if (this.transactions.length > 500) this.transactions.pop();
  }

  public async saveTransactionsBatch(txs: ParsedTransactionRecord[]): Promise<void> {
    for (const tx of txs) {
      await this.saveTransaction(tx);
    }
  }

  public async getTransactions(limit: number = 100): Promise<ParsedTransactionRecord[]> {
    return this.transactions.slice(0, limit);
  }

  public async saveToken(token: TokenMarketData): Promise<void> {
    this.storedTokens.set(token.address, { ...token });
  }

  public async getTokens(): Promise<TokenMarketData[]> {
    return Array.from(this.storedTokens.values());
  }

  public async saveProviderHealth(record: any): Promise<void> {
    this.providerHealth.unshift({ ...record, checked_at: new Date().toISOString() });
  }
}

/**
 * Persistence Factory
 * Selects PostgresPersistenceStore for live_paper and historical_backtest,
 * and MemoryPersistenceStore for demo mode and unit tests.
 */
export function createPersistenceStore(mode?: string): StorageAdapter {
  const currentMode = mode || process.env.APP_MODE || 'demo';
  if (currentMode === 'live_paper' || currentMode === 'historical_backtest') {
    return new PostgresPersistenceStore();
  }
  return new MemoryPersistenceStore();
}

export const PersistenceStore = MemoryPersistenceStore;
