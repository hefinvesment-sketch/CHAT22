import re

with open('src/services/persistence.ts', 'r') as f:
    content = f.read()

def replace_fn(match):
    return """
  public async saveSignal(signal: AlphaSignal): Promise<void> {
    if (!this.pool) throw new Error('Database pool not ready');
    await this.pool.query(
      `INSERT INTO tokens (address, symbol, name, liquidity_usd) VALUES ($1, $2, $3, $4)
       ON CONFLICT (address) DO UPDATE SET liquidity_usd = EXCLUDED.liquidity_usd;`,
      [signal.tokenAddress, signal.tokenSymbol, signal.tokenSymbol, signal.liquidityUsd || null]
    );

    const query = `
      INSERT INTO signals (
        id, token_address, token_symbol, timestamp, alpha_score, data_status, signal_state,
        decision_status, rejection_reason, rejection_code, independent_elite_count,
        total_smart_money_inflow_usd, price_at_signal, price_displacement_from_vwap_percent,
        market_regime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      await this.pool.query(
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

      // Save feature evidence
      const featureKeys = [
        'traderSkillScore', 'copyabilityScore', 'independentConsensusScore',
        'convictionSurpriseScore', 'smartMoneyAccelerationScore', 'entryQualityScore',
        'liquidityTokenQualityScore', 'regimeFitScore', 'emergingTraderScore'
      ] as const;
      
      for (const key of featureKeys) {
        const evidence = signal.features[key] as any;
        if (evidence) {
          await this.pool.query(
            `INSERT INTO signal_feature_evidence (
              signal_id, feature_name, value, status, source, observed_at, sample_size
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (signal_id, feature_name) DO UPDATE SET
              value = EXCLUDED.value, status = EXCLUDED.status, source = EXCLUDED.source,
              observed_at = EXCLUDED.observed_at, sample_size = EXCLUDED.sample_size;`,
            [
              signal.id, key, evidence.value, evidence.status, evidence.source,
              evidence.timestamp, evidence.sampleSize ?? null
            ]
          );
        }
      }
    }
  }

  public async getSignals"""

content = re.sub(r'  public async saveSignal\(signal: AlphaSignal\): Promise<void> \{.*?  public async getSignals', replace_fn, content, flags=re.DOTALL)

with open('src/services/persistence.ts', 'w') as f:
    f.write(content)
