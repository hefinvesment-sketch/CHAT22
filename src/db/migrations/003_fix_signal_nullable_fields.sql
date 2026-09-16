ALTER TABLE signals ALTER COLUMN independent_elite_count DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN total_smart_money_inflow_usd DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN price_displacement_from_vwap_percent DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN market_regime DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN price_at_signal DROP NOT NULL;

ALTER TABLE signal_features ALTER COLUMN trader_skill_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN copyability_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN independent_consensus_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN conviction_surprise_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN smart_money_acceleration_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN entry_quality_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN liquidity_token_quality_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN regime_fit_score DROP NOT NULL;
ALTER TABLE signal_features ALTER COLUMN emerging_trader_score DROP NOT NULL;

ALTER TABLE signal_feature_evidence DROP CONSTRAINT IF EXISTS fk_signal_feature_evidence_signal_id;
ALTER TABLE signal_feature_evidence ADD CONSTRAINT fk_signal_feature_evidence_signal_id FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE;
