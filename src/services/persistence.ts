import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { 
  PaperPortfolio, 
  PaperPosition, 
  PaperTradeRecord, 
  AlphaSignal, 
  WalletProfile,
  TokenMarketData,
  StrategyDecisionRecord,
  StrategyEquitySnapshot,
  FeatureEvidence,
} from '../types';
import { ParsedTransactionRecord } from './heliusParser';
import { getErrorMessage } from '../utils/errors';

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
    details?: unknown;
  }): Promise<void>;
  saveWallet(wallet: WalletProfile): Promise<void>;
  getWallets(): Promise<WalletProfile[]>;
  saveTransaction(tx: ParsedTransactionRecord): Promise<void>;
  saveTransactionsBatch(txs: ParsedTransactionRecord[]): Promise<void>;
  getTransactions(limit?: number): Promise<ParsedTransactionRecord[]>;
  getTransactionsForToken(tokenAddress: string, fromTimestamp?: string, toTimestamp?: string): Promise<ParsedTransactionRecord[]>;
  saveToken(token: TokenMarketData): Promise<void>;
  getTokens(): Promise<TokenMarketData[]>;

  saveStrategyDecision(record: StrategyDecisionRecord): Promise<void>;
  getStrategyDecisions(limit?: number): Promise<StrategyDecisionRecord[]>;
  getStrategyDecisionsForStrategy(strategyKey: string, limit?: number): Promise<StrategyDecisionRecord[]>;
  getStrategyDecisionsForSignal(signalId: string): Promise<StrategyDecisionRecord[]>;
  saveStrategyEquitySnapshot(snapshot: StrategyEquitySnapshot): Promise<void>;
  getStrategyEquitySnapshots(strategyKey: string, limit?: number): Promise<StrategyEquitySnapshot[]>;
  saveProviderHealth(record: {
    providerName: string;
    status: string;
    latencyMs?: number;
    message?: string;
  }): Promise<void>;
  getIngestionCheckpoint(sourceKey: string): Promise<{ lastSignature: string; lastSlot: number } | null>;
  saveIngestionCheckpoint(sourceKey: string, signature: string, slot: number): Promise<void>;
}

/**
 * Real PostgreSQL Persistence Store
 * Enforces true database connections, runs migrations, verifies schema,
 * and reports health based on actual query execution.
 */
export class PostgresPersistenceStore implements StorageAdapter {
  private pool: Pool | null = null;
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
      this.pool = new Pool({
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
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.connectionError = msg;
      console.error('[PostgresPersistenceStore Init Error]:', msg);
      throw err;
    }
  }

  private async runMigrations(client: PoolClient): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(128) PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      const migrationsDir = path.join(process.cwd(), 'src/db/migrations');
      if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        for (const file of files) {
          const res = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
          if (res.rowCount === 0) {
            console.log(`[PostgresPersistenceStore]: Applying migration ${file}...`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await client.query('BEGIN');
            try {
              await client.query(sql);
              await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
              await client.query('COMMIT');
              console.log(`[PostgresPersistenceStore]: Migration ${file} applied successfully.`);
            } catch (err) {
              await client.query('ROLLBACK');
              console.error(`[PostgresPersistenceStore]: Failed to apply migration ${file}:`, err);
              throw err;
            }
          }
        }
      }
      console.log('[PostgresPersistenceStore]: All migrations are up to date.');
    } catch (err: unknown) {
      console.error('[PostgresPersistenceStore Migration Error]:', getErrorMessage(err));
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
    } catch (err: unknown) {
      return { isConnected: false, message: `PostgreSQL probe query failed: ${getErrorMessage(err)}` };
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
      maxDrawdownPercent: null,
      winRatePercent: null,
      profitFactor: null,
      expectedValuePerTradeUsd: null,
      sharpeRatio: null,
      averageSlippageBps: null,
      averageDetectionLatencyMs: null,
      copyEfficiencyPercent: null,
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
        signal_id, detection_latency_ms, slippage_percent,
        signal_alpha_score, strategy_name, strategy_key, allocation_percent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (id) DO UPDATE SET
        current_price = EXCLUDED.current_price,
        current_value_usd = EXCLUDED.current_value_usd,
        unrealized_pnl_usd = EXCLUDED.unrealized_pnl_usd,
        trailing_stop_price = EXCLUDED.trailing_stop_price,
        signal_alpha_score = EXCLUDED.signal_alpha_score,
        strategy_name = EXCLUDED.strategy_name,
        strategy_key = EXCLUDED.strategy_key,
        allocation_percent = EXCLUDED.allocation_percent;
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
      position.slippageIncurredPercent,
      position.signalAlphaScore ?? null,
      position.strategyName ?? null,
      position.strategyKey ?? null,
      position.allocationPercent ?? null
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
      allocationPercent: row.allocation_percent !== null && row.allocation_percent !== undefined ? parseFloat(row.allocation_percent) : null,
      stopLossPrice: parseFloat(row.stop_loss_price),
      takeProfitPrice: parseFloat(row.take_profit_price),
      trailingStopPrice: row.trailing_stop_price ? parseFloat(row.trailing_stop_price) : undefined,
      strategyName: row.strategy_name || null,
      strategyKey: row.strategy_key || null,
      signalId: row.signal_id,
      signalAlphaScore: row.signal_alpha_score !== null && row.signal_alpha_score !== undefined ? parseFloat(row.signal_alpha_score) : null,
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
      exitReason: row.exit_reason as PaperTradeRecord['exitReason'],
      strategyName: 'AlphaGraph Institutional Strategy',
      feesPaidUsd: parseFloat(row.fees_paid_usd),
      slippagePaidUsd: parseFloat(row.slippage_paid_usd)
    }));
  }




  public async saveSignal(signal: AlphaSignal): Promise<void> {
    if (!this.pool) return;
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Token Upsert
      await client.query(
        `INSERT INTO tokens (address, symbol) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING`,
        [signal.tokenAddress, signal.tokenSymbol]
      );

      // 2. Signal Save
      const query = `
        INSERT INTO signals (
          id, token_address, token_symbol, timestamp, alpha_score, data_status, signal_state,
          decision_status, rejection_reason, rejection_code, independent_elite_count,
          total_smart_money_inflow_usd, price_at_signal, price_displacement_from_vwap_percent,
          market_regime
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          alpha_score = EXCLUDED.alpha_score,
          data_status = EXCLUDED.data_status,
          signal_state = EXCLUDED.signal_state,
          decision_status = EXCLUDED.decision_status,
          rejection_reason = EXCLUDED.rejection_reason,
          rejection_code = EXCLUDED.rejection_code,
          independent_elite_count = EXCLUDED.independent_elite_count,
          total_smart_money_inflow_usd = EXCLUDED.total_smart_money_inflow_usd,
          price_at_signal = EXCLUDED.price_at_signal,
          price_displacement_from_vwap_percent = EXCLUDED.price_displacement_from_vwap_percent,
          market_regime = EXCLUDED.market_regime;
      `;
      await client.query(query, [
        signal.id,
        signal.tokenAddress,
        signal.tokenSymbol,
        signal.timestamp,
        signal.alphaScore,
        signal.dataStatus,
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

      if (signal.features) {
        await client.query(
          `INSERT INTO signal_features (
            signal_id, trader_skill_score, copyability_score, independent_consensus_score,
            conviction_surprise_score, smart_money_acceleration_score, entry_quality_score,
            liquidity_token_quality_score, regime_fit_score, emerging_trader_score,
            total_penalties, penalties_detail
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (signal_id) DO UPDATE SET
            trader_skill_score = EXCLUDED.trader_skill_score,
            copyability_score = EXCLUDED.copyability_score,
            independent_consensus_score = EXCLUDED.independent_consensus_score,
            conviction_surprise_score = EXCLUDED.conviction_surprise_score,
            smart_money_acceleration_score = EXCLUDED.smart_money_acceleration_score,
            entry_quality_score = EXCLUDED.entry_quality_score,
            liquidity_token_quality_score = EXCLUDED.liquidity_token_quality_score,
            regime_fit_score = EXCLUDED.regime_fit_score,
            emerging_trader_score = EXCLUDED.emerging_trader_score,
            total_penalties = EXCLUDED.total_penalties,
            penalties_detail = EXCLUDED.penalties_detail;`,
          [
            signal.id,
            signal.features.traderSkillScore?.value ?? null,
            signal.features.copyabilityScore?.value ?? null,
            signal.features.independentConsensusScore?.value ?? null,
            signal.features.convictionSurpriseScore?.value ?? null,
            signal.features.smartMoneyAccelerationScore?.value ?? null,
            signal.features.entryQualityScore?.value ?? null,
            signal.features.liquidityTokenQualityScore?.value ?? null,
            signal.features.regimeFitScore?.value ?? null,
            signal.features.emergingTraderScore?.value ?? null,
            signal.features.totalPenalties,
            JSON.stringify(signal.features.penalties || {})
          ]
        );

        const featureKeys = [
          'traderSkillScore', 'copyabilityScore', 'independentConsensusScore',
          'convictionSurpriseScore', 'smartMoneyAccelerationScore', 'entryQualityScore',
          'liquidityTokenQualityScore', 'regimeFitScore', 'emergingTraderScore'
        ] as const;
        
        for (const key of featureKeys) {
          const feature = signal.features[key];
          if (feature) {
            await client.query(
              `INSERT INTO signal_feature_evidence (
                signal_id, feature_name, value, status, source, observed_at, sample_size
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (signal_id, feature_name) DO UPDATE SET
                value = EXCLUDED.value, status = EXCLUDED.status, source = EXCLUDED.source,
                observed_at = EXCLUDED.observed_at, sample_size = EXCLUDED.sample_size;`,
              [
                signal.id, key, feature.value, feature.status, feature.source,
                feature.timestamp, feature.sampleSize ?? null
              ]
            );
          }
        }
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[PostgresPersistenceStore] saveSignal transaction failed:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  public async getSignals(limit: number = 50): Promise<AlphaSignal[]> {
    if (!this.pool) return [];
    
    const query = `
      SELECT s.*, o.return_5m_percent, o.return_15m_percent, o.return_1h_percent, o.return_4h_percent,
             o.return_24h_percent, o.return_3d_percent, o.return_7d_percent,
             o.max_favorable_excursion_percent, o.max_adverse_excursion_percent,
             f.total_penalties, f.penalties_detail
      FROM signals s
      LEFT JOIN signal_features f ON s.id = f.signal_id
      LEFT JOIN signal_outcomes o ON s.id = o.signal_id
      ORDER BY s.timestamp DESC LIMIT $1
    `;
    const res = await this.pool.query(query, [limit]);
    if (res.rows.length === 0) return [];
    
    const signalIds = res.rows.map(r => r.id);
    
    const evidenceRes = await this.pool.query(`
      SELECT signal_id, feature_name, value, status, source, observed_at, sample_size
      FROM signal_feature_evidence
      WHERE signal_id = ANY($1)
    `, [signalIds]);
    
    const evidenceBySignal = new Map<string, Record<string, FeatureEvidence<number>>>();
    for (const row of evidenceRes.rows) {
      if (!evidenceBySignal.has(row.signal_id)) evidenceBySignal.set(row.signal_id, {});
      evidenceBySignal.get(row.signal_id)![row.feature_name] = {
        value: row.value !== null ? parseFloat(row.value) : 0,
        status: row.status,
        source: row.source,
        timestamp: new Date(row.observed_at).toISOString(),
        sampleSize: row.sample_size !== null ? parseInt(row.sample_size) : undefined
      };
    }

    return res.rows.map(row => {
      const evidences = evidenceBySignal.get(row.id) || {};
      
      const historicalExpectancy = {
        dataStatus: row.historical_data_status || 'INSUFFICIENT_SAMPLE',
        similarEventsCount: row.historical_similar_events_count || 0,
        winRatePercent: row.historical_win_rate !== null ? parseFloat(row.historical_win_rate) : null,
        averageWinnerPercent: row.historical_avg_winner !== null ? parseFloat(row.historical_avg_winner) : null,
        averageLoserPercent: row.historical_avg_loser !== null ? parseFloat(row.historical_avg_loser) : null,
        medianReturnPercent: row.historical_median_return !== null ? parseFloat(row.historical_median_return) : null,
        grossEvPercent: row.historical_gross_ev !== null ? parseFloat(row.historical_gross_ev) : null,
        executionCostPercent: row.historical_exec_cost !== null ? parseFloat(row.historical_exec_cost) : null,
        netEvPercent: row.historical_net_ev !== null ? parseFloat(row.historical_net_ev) : null,
        maxFavorableExcursionPercent: null,
        maxAdverseExcursionPercent: null,
        return5mPercent: null,
        return15mPercent: null,
        return1hPercent: null,
        return4hPercent: null,
        return24hPercent: null
      };

      return {
        id: row.id,
        tokenSymbol: row.token_symbol,
        tokenAddress: row.token_address,
        timestamp: new Date(row.timestamp).toISOString(),
        alphaScore: row.alpha_score !== null ? row.alpha_score : null,
        dataStatus: row.data_status || "INSUFFICIENT_DATA",
        signalState: row.signal_state as AlphaSignal['signalState'],
        decision: row.decision_status as AlphaSignal['decision'],
        rejectionReason: row.rejection_reason,
        rejectionCode: row.rejection_code,
        liquidityUsd: undefined,
        independentEliteCount: row.independent_elite_count !== null ? parseInt(row.independent_elite_count) : null,
        totalSmartMoneyInflowUsd: row.total_smart_money_inflow_usd !== null ? parseFloat(row.total_smart_money_inflow_usd) : null,
        priceAtSignal: parseFloat(row.price_at_signal),
        priceDisplacementFromVwapPercent: row.price_displacement_from_vwap_percent !== null ? parseFloat(row.price_displacement_from_vwap_percent) : null,
        currentRegime: row.market_regime || null,
        features: {
          traderSkillScore: evidences['traderSkillScore'] || null,
          copyabilityScore: evidences['copyabilityScore'] || null,
          independentConsensusScore: evidences['independentConsensusScore'] || null,
          convictionSurpriseScore: evidences['convictionSurpriseScore'] || null,
          smartMoneyAccelerationScore: evidences['smartMoneyAccelerationScore'] || null,
          entryQualityScore: evidences['entryQualityScore'] || null,
          liquidityTokenQualityScore: evidences['liquidityTokenQualityScore'] || null,
          regimeFitScore: evidences['regimeFitScore'] || null,
          emergingTraderScore: evidences['emergingTraderScore'] || null,
          penalties: row.penalties_detail || {
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
          totalPenalties: row.total_penalties || 0
        },
        participantWallets: [],
        historicalExpectancy: historicalExpectancy as AlphaSignal['historicalExpectancy'],
        executionSimulation: undefined,
        outcomes: row.return_24h_percent !== null ? {
          return5mPercent: row.return_5m_percent,
          return15mPercent: row.return_15m_percent,
          return1hPercent: row.return_1h_percent,
          return4hPercent: row.return_4h_percent,
          return24hPercent: row.return_24h_percent,
          return3dPercent: row.return_3d_percent,
          return7dPercent: row.return_7d_percent,
          maxFavorableExcursionPercent: row.max_favorable_excursion_percent,
          maxAdverseExcursionPercent: row.max_adverse_excursion_percent,
        } : undefined
      };
    });
  }





  public async saveRiskEvent(event: {
    portfolioId?: string;
    signalId?: string;
    eventType: string;
    rejectionCode?: string;
    reason: string;
    details?: unknown;
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
        trade_count, quality_score, copyability_score, is_eligible_smart_money, is_active, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW())
      ON CONFLICT (address) DO UPDATE SET
        label = COALESCE(EXCLUDED.label, wallets.label),
        wallet_age_days = COALESCE(EXCLUDED.wallet_age_days, wallets.wallet_age_days),
        core_asset_ratio = COALESCE(EXCLUDED.core_asset_ratio, wallets.core_asset_ratio),
        portfolio_value_usd = COALESCE(EXCLUDED.portfolio_value_usd, wallets.portfolio_value_usd),
        trade_count = EXCLUDED.trade_count,
        quality_score = COALESCE(EXCLUDED.quality_score, wallets.quality_score),
        copyability_score = COALESCE(EXCLUDED.copyability_score, wallets.copyability_score),
        is_eligible_smart_money = EXCLUDED.is_eligible_smart_money,
        updated_at = NOW();
    `;
    await this.pool.query(query, [
      wallet.address,
      wallet.label || null,
      wallet.walletAgeDays ?? null,
      wallet.coreAssetRatio ?? null,
      wallet.portfolioValueUsd ?? null,
      wallet.tradeCount || 0,
      wallet.qualityScore ?? null,
      wallet.copyability?.copyabilityScore ?? null,
      wallet.isEligibleSmartMoney ?? false
    ]);
  }

  public async getWallets(): Promise<WalletProfile[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM wallets WHERE is_active = TRUE ORDER BY quality_score DESC NULLS LAST');
    return res.rows.map(row => ({
      address: row.address,
      label: row.label || undefined,
      firstSeenDaysAgo: row.wallet_age_days !== null ? parseInt(row.wallet_age_days, 10) : null,
      walletAgeDays: row.wallet_age_days !== null ? parseInt(row.wallet_age_days, 10) : null,
      portfolioValueUsd: row.portfolio_value_usd !== null ? parseFloat(row.portfolio_value_usd) : null,
      solBalance: null,
      usdtBalance: null,
      usdcBalance: null,
      wbtcBalance: null,
      wethBalance: null,
      coreAssetRatio: row.core_asset_ratio !== null ? parseFloat(row.core_asset_ratio) : null,
      tradeCount: row.trade_count || 0,
      tokensTradedCount: 0,
      realizedPnlUsd: null,
      unrealizedPnlUsd: null,
      winRate: null,
      profitFactor: null,
      maxDrawdownPercent: null,
      avgHoldingTimeHours: null,
      qualityScore: row.quality_score !== null ? parseFloat(row.quality_score) : null,
      consistencyScore: null,
      returnScore: null,
      drawdownScore: null,
      sampleScore: null,
      concentrationPenalty: null,
      top1TradeProfitPercent: null,
      top3TradeProfitPercent: null,
      top5TradeProfitPercent: null,
      top10TradeProfitPercent: null,
      emergingAlphaScore: null,
      momentumStatus: null,
      isEligibleSmartMoney: row.is_eligible_smart_money ?? false,
      clusterId: null,
      relatedWalletsCount: 0,
      genome: null,
      copyability: row.copyability_score !== null ? {
        copyabilityScore: parseFloat(row.copyability_score),
        sourceTraderReturn: 0,
        achievableSimulatedReturn: 0,
        latencyLossPercent: 0,
        slippageLossPercent: 0,
        feeLossPercent: 0,
        missedTradePercent: 0,
        exitMismatchLossPercent: 0,
        copyEfficiency: 0,
        averageDetectionLatencyMs: 0,
        averageSlippageBps: 0,
        recommendation: parseFloat(row.copyability_score) >= 70 ? 'EXCELLENT_TO_COPY' : 'MODERATE_VIABILITY'
      } : null,
      holdings: [],
      rollingScores: null
    }));
  }

  public async saveTransaction(tx: ParsedTransactionRecord): Promise<void> {
    if (!this.pool) return;
    try {
      // 1. Ensure wallet exists
      if (tx.walletAddress && tx.walletAddress !== 'UNKNOWN_WALLET') {
        await this.pool.query(
          `INSERT INTO wallets (address, label, wallet_age_days, core_asset_ratio, portfolio_value_usd, quality_score, copyability_score, is_eligible_smart_money, trade_count)
           VALUES ($1, $2, NULL, NULL, NULL, NULL, NULL, false, 1)
           ON CONFLICT (address) DO UPDATE SET trade_count = wallets.trade_count + 1, updated_at = NOW();`,
          [tx.walletAddress, `Trader-${tx.walletAddress.slice(0, 4)}`]
        );
      }
      // 2. Ensure tokens exist
      const tradeTokenAddress = tx.tradeDirection === 'BUY' ? tx.tokenOutAddress : tx.tokenInAddress;
      let tradeTokenSymbol = tx.tradeDirection === 'BUY' ? tx.tokenOutSymbol : tx.tokenInSymbol;
      if (!tradeTokenSymbol || tradeTokenSymbol === 'TOKEN_IN' || tradeTokenSymbol === 'TOKEN_OUT') {
        tradeTokenSymbol = tradeTokenAddress ? `${tradeTokenAddress.slice(0, 4)}..${tradeTokenAddress.slice(-4)}` : 'SOL-TOKEN';
      }
      if (tradeTokenAddress) {
        await this.pool.query(
          `INSERT INTO tokens (address, symbol, name) VALUES ($1, $2, $3) 
           ON CONFLICT (address) DO UPDATE SET 
             symbol = CASE WHEN tokens.symbol IN ('TOKEN_IN', 'TOKEN_OUT') THEN EXCLUDED.symbol ELSE tokens.symbol END,
             name = CASE WHEN tokens.name IN ('TOKEN_IN', 'TOKEN_OUT') THEN EXCLUDED.name ELSE tokens.name END;`,
          [tradeTokenAddress, tradeTokenSymbol, tradeTokenSymbol]
        );
      }
      // 3. Insert trade
      const executionPriceUsd = tx.usdValue && tx.tradeDirection === 'BUY' && tx.tokenOutAmount ? tx.usdValue / tx.tokenOutAmount
        : tx.usdValue && tx.tradeDirection === 'SELL' && tx.tokenInAmount ? tx.usdValue / tx.tokenInAmount
        : tx.executionPriceUsd || null;

      await this.pool.query(
        `INSERT INTO wallet_trades (
          wallet_address, signature, slot, timestamp, dex,
          token_in_address, token_in_symbol, token_in_amount,
          token_out_address, token_out_symbol, token_out_amount,
          trade_direction, usd_value, execution_price_usd, fee_usd
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (wallet_address, signature) DO NOTHING;`,
        [
          tx.walletAddress || 'UNKNOWN_WALLET',
          tx.signature,
          tx.slot,
          tx.timestamp,
          tx.dex,
          tx.tokenInAddress,
          tx.tokenInSymbol,
          tx.tokenInAmount,
          tx.tokenOutAddress,
          tx.tokenOutSymbol,
          tx.tokenOutAmount,
          tx.tradeDirection,
          tx.usdValue,
          executionPriceUsd,
          tx.transactionFeeUsd
        ]
      );
    } catch (err: unknown) {
      console.warn(`[Persistence saveTransaction Warning]: ${getErrorMessage(err)}`);
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
        slot: row.slot ? parseInt(row.slot, 10) : 0,
        timestamp: new Date(row.timestamp).toISOString(),
        walletAddress: row.wallet_address,
        dex: row.dex || 'Solana DEX',
        tradeDirection: row.trade_direction,
        tokenInAddress: row.token_in_address || row.token_address || '',
        tokenInSymbol: row.token_in_symbol || row.token_symbol || '',
        tokenInAmount: row.token_in_amount !== null ? parseFloat(row.token_in_amount) : (row.token_amount ? parseFloat(row.token_amount) : 0),
        tokenOutAddress: row.token_out_address || row.token_address || '',
        tokenOutSymbol: row.token_out_symbol || row.token_symbol || '',
        tokenOutAmount: row.token_out_amount !== null ? parseFloat(row.token_out_amount) : (row.token_amount ? parseFloat(row.token_amount) : 0),
        executionPriceUsd: row.execution_price_usd !== null ? parseFloat(row.execution_price_usd) : 0,
        usdValue: row.usd_value !== null ? parseFloat(row.usd_value) : 0,
        transactionFeeUsd: row.fee_usd !== null ? parseFloat(row.fee_usd) : 0,
        isStablecoinRotation: false,
        isAirdropOrTransfer: row.is_airdrop_or_transfer ?? false
      }));
    } catch {
      return [];
    }
  }

  public async getTransactionsForToken(
    tokenAddress: string,
    fromTimestamp?: string,
    toTimestamp?: string
  ): Promise<ParsedTransactionRecord[]> {
    if (!this.pool) return [];
    try {
      let query = `SELECT * FROM wallet_trades WHERE (LOWER(token_address) = LOWER($1) OR LOWER(token_in_address) = LOWER($1) OR LOWER(token_out_address) = LOWER($1))`;
      const params: unknown[] = [tokenAddress];
      if (fromTimestamp) {
        params.push(fromTimestamp);
        query += ` AND timestamp >= $${params.length}`;
      }
      if (toTimestamp) {
        params.push(toTimestamp);
        query += ` AND timestamp <= $${params.length}`;
      }
      query += ` ORDER BY timestamp ASC`;
      const res = await this.pool.query(query, params);
      return res.rows.map(row => ({
        signature: row.signature,
        slot: row.slot ? parseInt(row.slot, 10) : 0,
        timestamp: new Date(row.timestamp).toISOString(),
        walletAddress: row.wallet_address,
        dex: row.dex || 'Solana DEX',
        tradeDirection: row.trade_direction,
        tokenInAddress: row.token_in_address || (row.trade_direction === 'BUY' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : row.token_address) || '',
        tokenInSymbol: row.token_in_symbol || (row.trade_direction === 'BUY' ? 'USDC' : row.token_symbol) || '',
        tokenInAmount: row.token_in_amount !== null ? parseFloat(row.token_in_amount) : (row.token_amount ? parseFloat(row.token_amount) : 0),
        tokenOutAddress: row.token_out_address || (row.trade_direction === 'BUY' ? row.token_address : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') || '',
        tokenOutSymbol: row.token_out_symbol || (row.trade_direction === 'BUY' ? row.token_symbol : 'USDC') || '',
        tokenOutAmount: row.token_out_amount !== null ? parseFloat(row.token_out_amount) : (row.token_amount ? parseFloat(row.token_amount) : 0),
        executionPriceUsd: row.execution_price_usd !== null ? parseFloat(row.execution_price_usd) : 0,
        usdValue: row.usd_value !== null ? parseFloat(row.usd_value) : 0,
        transactionFeeUsd: row.fee_usd !== null ? parseFloat(row.fee_usd) : 0,
        isStablecoinRotation: false,
        isAirdropOrTransfer: row.is_airdrop_or_transfer ?? false
      }));
    } catch {
      return [];
    }
  }

  public async saveToken(token: TokenMarketData): Promise<void> {
    if (!this.pool) return;
    try {
      const decimalsVal = (token.decimals === 'TOKEN_DECIMALS_UNAVAILABLE' || token.decimals === null || token.decimals === undefined)
        ? null
        : token.decimals;
      const mintRevoked = token.hasMintAuthority !== null && token.hasMintAuthority !== undefined ? !token.hasMintAuthority : null;
      const freezeRevoked = token.hasFreezeAuthority !== null && token.hasFreezeAuthority !== undefined ? !token.hasFreezeAuthority : null;

      await this.pool.query(
        `INSERT INTO tokens (
          address, symbol, name, decimals, liquidity_usd, market_cap_usd,
          mint_authority_revoked, freeze_authority_revoked, top_10_holder_percent,
          is_honeypot_safe, risk_score, volume_24h_usd, fdv_usd, holder_count,
          token_age_days, top_20_holder_percent, dev_holdings_percent, liquidity_locked_percent,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (address) DO UPDATE SET
          symbol = EXCLUDED.symbol,
          name = EXCLUDED.name,
          decimals = COALESCE(EXCLUDED.decimals, tokens.decimals),
          liquidity_usd = EXCLUDED.liquidity_usd,
          market_cap_usd = EXCLUDED.market_cap_usd,
          mint_authority_revoked = COALESCE(EXCLUDED.mint_authority_revoked, tokens.mint_authority_revoked),
          freeze_authority_revoked = COALESCE(EXCLUDED.freeze_authority_revoked, tokens.freeze_authority_revoked),
          top_10_holder_percent = COALESCE(EXCLUDED.top_10_holder_percent, tokens.top_10_holder_percent),
          is_honeypot_safe = COALESCE(EXCLUDED.is_honeypot_safe, tokens.is_honeypot_safe),
          risk_score = EXCLUDED.risk_score,
          volume_24h_usd = COALESCE(EXCLUDED.volume_24h_usd, tokens.volume_24h_usd),
          fdv_usd = COALESCE(EXCLUDED.fdv_usd, tokens.fdv_usd),
          holder_count = COALESCE(EXCLUDED.holder_count, tokens.holder_count),
          token_age_days = COALESCE(EXCLUDED.token_age_days, tokens.token_age_days),
          top_20_holder_percent = COALESCE(EXCLUDED.top_20_holder_percent, tokens.top_20_holder_percent),
          dev_holdings_percent = COALESCE(EXCLUDED.dev_holdings_percent, tokens.dev_holdings_percent),
          liquidity_locked_percent = COALESCE(EXCLUDED.liquidity_locked_percent, tokens.liquidity_locked_percent),
          updated_at = NOW();`,
        [
          token.address,
          token.symbol,
          token.name,
          decimalsVal,
          token.liquidityUsd ?? null,
          token.marketCapUsd ?? null,
          mintRevoked,
          freezeRevoked,
          token.top10HoldersPercent ?? null,
          token.isHoneypotSafe ?? null,
          token.riskScore ?? null,
          token.volume24hUsd ?? null,
          token.fdvUsd ?? null,
          token.holderCount ?? null,
          token.tokenAgeDays ?? null,
          token.top20HoldersPercent ?? null,
          token.devHoldingsPercent ?? null,
          token.liquidityLockedPercent ?? null
        ]
      );
    } catch (err: unknown) {
      console.warn(`[Persistence saveToken Warning]: ${getErrorMessage(err)}`);
    }
  }

  public async getTokens(): Promise<TokenMarketData[]> {
    if (!this.pool) return [];
    try {
      const res = await this.pool.query(`SELECT * FROM tokens ORDER BY liquidity_usd DESC NULLS LAST LIMIT 50`);
      return res.rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        address: row.address,
        decimals: row.decimals !== null ? parseInt(row.decimals, 10) : 'TOKEN_DECIMALS_UNAVAILABLE',
        priceUsd: null,
        priceChange1h: null,
        priceChange24h: null,
        volume24hUsd: row.volume_24h_usd !== null ? parseFloat(row.volume_24h_usd) : null,
        liquidityUsd: row.liquidity_usd !== null ? parseFloat(row.liquidity_usd) : null,
        marketCapUsd: row.market_cap_usd !== null ? parseFloat(row.market_cap_usd) : null,
        fdvUsd: row.fdv_usd !== null ? parseFloat(row.fdv_usd) : null,
        holderCount: row.holder_count !== null ? parseInt(row.holder_count, 10) : null,
        tokenAgeDays: row.token_age_days !== null ? parseInt(row.token_age_days, 10) : null,
        top10HoldersPercent: row.top_10_holder_percent !== null ? parseFloat(row.top_10_holder_percent) : null,
        top20HoldersPercent: row.top_20_holder_percent !== null ? parseFloat(row.top_20_holder_percent) : null,
        devHoldingsPercent: row.dev_holdings_percent !== null ? parseFloat(row.dev_holdings_percent) : null,
        hasFreezeAuthority: row.freeze_authority_revoked !== null ? !row.freeze_authority_revoked : null,
        hasMintAuthority: row.mint_authority_revoked !== null ? !row.mint_authority_revoked : null,
        liquidityLockedPercent: row.liquidity_locked_percent !== null ? parseFloat(row.liquidity_locked_percent) : null,
        isHoneypotSafe: row.is_honeypot_safe !== null ? row.is_honeypot_safe : null,
        riskScore: row.risk_score !== null ? parseFloat(row.risk_score) : null,
        smartMoneyVwap: null,
        netFlow24hUsd: null
      }));
    } catch {
      return [];
    }
  }

  public async saveStrategyDecision(record: StrategyDecisionRecord): Promise<void> {
    if (!this.pool) return;
    const query = `
      INSERT INTO strategy_signal_decisions (
        id, strategy_key, strategy_name, token_address, token_symbol,
        allocated_position_usd, signal_id, decision, reason, evaluated_at,
        alpha_score, feature_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (strategy_key, signal_id) DO UPDATE SET
        decision = EXCLUDED.decision,
        reason = EXCLUDED.reason,
        evaluated_at = EXCLUDED.evaluated_at,
        alpha_score = EXCLUDED.alpha_score,
        allocated_position_usd = EXCLUDED.allocated_position_usd,
        feature_snapshot = EXCLUDED.feature_snapshot;
    `;
    await this.pool.query(query, [
      record.id, record.strategyKey, record.strategyName, record.tokenAddress, record.tokenSymbol,
      record.allocatedPositionUsd, record.signalId, record.decision, record.reason, record.evaluatedAt,
      record.alphaScore, JSON.stringify(record.featureSnapshot || {})
    ]);
  }

  public async getStrategyDecisions(limit: number = 100): Promise<StrategyDecisionRecord[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM strategy_signal_decisions ORDER BY evaluated_at DESC LIMIT $1', [limit]);
    return res.rows.map(r => ({
      id: r.id, strategyKey: r.strategy_key, strategyName: r.strategy_name, tokenAddress: r.token_address,
      tokenSymbol: r.token_symbol, allocatedPositionUsd: r.allocated_position_usd !== null ? parseFloat(r.allocated_position_usd) : null,
      signalId: r.signal_id, decision: r.decision, reason: r.reason, evaluatedAt: new Date(r.evaluated_at).toISOString(),
      alphaScore: r.alpha_score !== null ? parseFloat(r.alpha_score) : null, featureSnapshot: r.feature_snapshot
    }));
  }

  public async getStrategyDecisionsForStrategy(strategyKey: string, limit: number = 100): Promise<StrategyDecisionRecord[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM strategy_signal_decisions WHERE strategy_key = $1 ORDER BY evaluated_at DESC LIMIT $2', [strategyKey, limit]);
    return res.rows.map(r => ({
      id: r.id, strategyKey: r.strategy_key, strategyName: r.strategy_name, tokenAddress: r.token_address,
      tokenSymbol: r.token_symbol, allocatedPositionUsd: r.allocated_position_usd !== null ? parseFloat(r.allocated_position_usd) : null,
      signalId: r.signal_id, decision: r.decision, reason: r.reason, evaluatedAt: new Date(r.evaluated_at).toISOString(),
      alphaScore: r.alpha_score !== null ? parseFloat(r.alpha_score) : null, featureSnapshot: r.feature_snapshot
    }));
  }

  public async getStrategyDecisionsForSignal(signalId: string): Promise<StrategyDecisionRecord[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM strategy_signal_decisions WHERE signal_id = $1 ORDER BY evaluated_at DESC', [signalId]);
    return res.rows.map(r => ({
      id: r.id, strategyKey: r.strategy_key, strategyName: r.strategy_name, tokenAddress: r.token_address,
      tokenSymbol: r.token_symbol, allocatedPositionUsd: r.allocated_position_usd !== null ? parseFloat(r.allocated_position_usd) : null,
      signalId: r.signal_id, decision: r.decision, reason: r.reason, evaluatedAt: new Date(r.evaluated_at).toISOString(),
      alphaScore: r.alpha_score !== null ? parseFloat(r.alpha_score) : null, featureSnapshot: r.feature_snapshot
    }));
  }

  public async saveStrategyEquitySnapshot(snapshot: StrategyEquitySnapshot): Promise<void> {
    if (!this.pool) return;
    const query = `
      INSERT INTO strategy_equity_snapshots (
        strategy_key, timestamp, equity_usd, drawdown_percent
      ) VALUES ($1, $2, $3, $4)
    `;
    await this.pool.query(query, [
      snapshot.strategyKey, snapshot.timestamp, snapshot.equityUsd, snapshot.drawdownPercent
    ]);
  }

  public async getStrategyEquitySnapshots(strategyKey: string, limit: number = 1000): Promise<StrategyEquitySnapshot[]> {
    if (!this.pool) return [];
    const res = await this.pool.query('SELECT * FROM strategy_equity_snapshots WHERE strategy_key = $1 ORDER BY timestamp ASC LIMIT $2', [strategyKey, limit]);
    return res.rows.map(r => ({
      id: r.id, strategyKey: r.strategy_key, timestamp: new Date(r.timestamp).toISOString(),
      equityUsd: parseFloat(r.equity_usd), drawdownPercent: parseFloat(r.drawdown_percent)
    }));
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

  public async getIngestionCheckpoint(sourceKey: string): Promise<{ lastSignature: string; lastSlot: number } | null> {
    if (!this.pool) return null;
    const res = await this.pool.query(
      'SELECT last_signature, last_slot FROM ingestion_checkpoints WHERE source_key = $1',
      [sourceKey]
    );
    if (!res.rows[0]) return null;
    return {
      lastSignature: res.rows[0].last_signature,
      lastSlot: parseInt(res.rows[0].last_slot, 10) || 0
    };
  }

  public async saveIngestionCheckpoint(sourceKey: string, signature: string, slot: number): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO ingestion_checkpoints (source_key, last_signature, last_slot, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (source_key) DO UPDATE SET
         last_signature = EXCLUDED.last_signature,
         last_slot = EXCLUDED.last_slot,
         updated_at = NOW();`,
      [sourceKey, signature, slot]
    );
  }
}

/**
 * In-Memory Persistence Store
 * Strictly reserved for APP_MODE=demo and isolated unit tests.
 */
export class MemoryPersistenceStore implements StorageAdapter {
  private signals: Map<string, AlphaSignal> = new Map();
  private riskEvents: {
    portfolioId?: string;
    signalId?: string;
    eventType: string;
    rejectionCode?: string;
    reason: string;
    details?: unknown;
  }[] = [];
  private providerHealth: {
    providerName: string;
    status: string;
    latencyMs?: number;
    message?: string;
    checked_at?: string;
  }[] = [];
  private wallets: Map<string, WalletProfile> = new Map();
  private transactions: ParsedTransactionRecord[] = [];
  private storedTokens: Map<string, TokenMarketData> = new Map();
  private trades: Map<string, PaperTradeRecord[]> = new Map();
  private positions: Map<string, PaperPosition[]> = new Map();
  private portfolios: Map<string, PaperPortfolio> = new Map();
  private strategyDecisions: StrategyDecisionRecord[] = [];
  private strategyEquitySnapshots: Map<string, StrategyEquitySnapshot[]> = new Map();
  private checkpoints: Map<string, { lastSignature: string; lastSlot: number }> = new Map();

  public async init(): Promise<void> {}

  public async checkHealth(): Promise<{ isConnected: boolean; message?: string; latencyMs?: number }> {
    return { isConnected: true, latencyMs: 0 };
  }

  public async getPortfolio(id: string): Promise<PaperPortfolio | null> {
    const p = this.portfolios.get(id);
    return p ? { ...p } : null;
  }

  public async savePortfolio(portfolio: PaperPortfolio): Promise<void> {
    this.portfolios.set(portfolio.id, { ...portfolio });
  }

  public async getPortfolios(): Promise<PaperPortfolio[]> {
    return Array.from(this.portfolios.values()).map(p => ({ ...p }));
  }

  public async savePosition(position: PaperPosition): Promise<void> {
    const list = this.positions.get(position.portfolioId) || [];
    const idx = list.findIndex(p => p.id === position.id);
    if (idx >= 0) {
      list[idx] = { ...position };
    } else {
      list.push({ ...position });
    }
    this.positions.set(position.portfolioId, list);
  }

  public async removePosition(positionId: string): Promise<void> {
    for (const [portId, list] of Array.from(this.positions.entries())) {
      this.positions.set(portId, list.filter(p => p.id !== positionId));
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

  public async getSignals(limit: number = 50): Promise<AlphaSignal[]> {
    return Array.from(this.signals.values()).slice(0, limit);
  }

  public async saveRiskEvent(event: {
    portfolioId?: string;
    signalId?: string;
    eventType: string;
    rejectionCode?: string;
    reason: string;
    details?: unknown;
  }): Promise<void> {
    this.riskEvents.unshift({ ...event });
  }

  public async saveWallet(wallet: WalletProfile): Promise<void> {
    this.wallets.set(wallet.address, { ...wallet });
  }

  public async getWallets(): Promise<WalletProfile[]> {
    return Array.from(this.wallets.values()).map(w => ({ ...w }));
  }

  public async saveTransaction(tx: ParsedTransactionRecord): Promise<void> {
    this.transactions.unshift({ ...tx });
  }

  public async saveTransactionsBatch(txs: ParsedTransactionRecord[]): Promise<void> {
    for (const tx of txs) {
      await this.saveTransaction(tx);
    }
  }

  public async getTransactions(limit: number = 100): Promise<ParsedTransactionRecord[]> {
    return this.transactions.slice(0, limit).map(t => ({ ...t }));
  }

  public async getTransactionsForToken(
    tokenAddress: string,
    fromTimestamp?: string,
    toTimestamp?: string
  ): Promise<ParsedTransactionRecord[]> {
    const lower = tokenAddress.toLowerCase();
    return this.transactions.filter(t => {
      const match = (t.tokenInAddress && t.tokenInAddress.toLowerCase() === lower) ||
                    (t.tokenOutAddress && t.tokenOutAddress.toLowerCase() === lower);
      if (!match) return false;
      if (fromTimestamp && t.timestamp < fromTimestamp) return false;
      if (toTimestamp && t.timestamp > toTimestamp) return false;
      return true;
    }).map(t => ({ ...t }));
  }

  public async saveToken(token: TokenMarketData): Promise<void> {
    this.storedTokens.set(token.address, { ...token });
  }

  public async getTokens(): Promise<TokenMarketData[]> {
    return Array.from(this.storedTokens.values()).map(t => ({ ...t }));
  }

  public async saveProviderHealth(record: {
    providerName: string;
    status: string;
    latencyMs?: number;
    message?: string;
  }): Promise<void> {
    this.providerHealth.unshift({ ...record, checked_at: new Date().toISOString() });
  }

  public async saveStrategyDecision(record: StrategyDecisionRecord): Promise<void> {
    const idx = this.strategyDecisions.findIndex(d => d.strategyKey === record.strategyKey && d.signalId === record.signalId);
    if (idx >= 0) {
      this.strategyDecisions[idx] = { ...record };
    } else {
      this.strategyDecisions.unshift({ ...record });
    }
  }

  public async getStrategyDecisions(limit: number = 100): Promise<StrategyDecisionRecord[]> {
    return this.strategyDecisions.slice(0, limit).map(d => ({ ...d }));
  }

  public async getStrategyDecisionsForStrategy(strategyKey: string, limit: number = 100): Promise<StrategyDecisionRecord[]> {
    return this.strategyDecisions.filter(d => d.strategyKey === strategyKey).slice(0, limit).map(d => ({ ...d }));
  }

  public async getStrategyDecisionsForSignal(signalId: string): Promise<StrategyDecisionRecord[]> {
    return this.strategyDecisions.filter(d => d.signalId === signalId).map(d => ({ ...d }));
  }

  public async saveStrategyEquitySnapshot(snapshot: StrategyEquitySnapshot): Promise<void> {
    const list = this.strategyEquitySnapshots.get(snapshot.strategyKey) || [];
    list.push({ ...snapshot });
    this.strategyEquitySnapshots.set(snapshot.strategyKey, list);
  }

  public async getStrategyEquitySnapshots(strategyKey: string, limit: number = 1000): Promise<StrategyEquitySnapshot[]> {
    const list = this.strategyEquitySnapshots.get(strategyKey) || [];
    return list.slice(0, limit).map(s => ({ ...s }));
  }

  public async getIngestionCheckpoint(sourceKey: string): Promise<{ lastSignature: string; lastSlot: number } | null> {
    const cp = this.checkpoints.get(sourceKey);
    return cp ? { ...cp } : null;
  }

  public async saveIngestionCheckpoint(sourceKey: string, signature: string, slot: number): Promise<void> {
    this.checkpoints.set(sourceKey, { lastSignature: signature, lastSlot: slot });
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
