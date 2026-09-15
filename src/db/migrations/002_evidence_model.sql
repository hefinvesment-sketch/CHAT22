ALTER TABLE signals ALTER COLUMN alpha_score DROP NOT NULL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS data_status VARCHAR(32) NOT NULL DEFAULT 'INSUFFICIENT_DATA';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS feature_version VARCHAR(32);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS data_version VARCHAR(32);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS strategy_version VARCHAR(32);

CREATE TABLE IF NOT EXISTS signal_feature_evidence (
  signal_id VARCHAR(64) NOT NULL,
  feature_name VARCHAR(64) NOT NULL,
  value NUMERIC,
  status VARCHAR(32) NOT NULL,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  sample_size INT,
  PRIMARY KEY (signal_id, feature_name)
);

ALTER TABLE tokens ALTER COLUMN decimals DROP NOT NULL;
ALTER TABLE tokens ALTER COLUMN decimals DROP DEFAULT;
ALTER TABLE tokens ALTER COLUMN mint_authority_revoked DROP NOT NULL;
ALTER TABLE tokens ALTER COLUMN mint_authority_revoked DROP DEFAULT;
ALTER TABLE tokens ALTER COLUMN freeze_authority_revoked DROP NOT NULL;
ALTER TABLE tokens ALTER COLUMN freeze_authority_revoked DROP DEFAULT;
ALTER TABLE tokens ALTER COLUMN lp_burned DROP NOT NULL;
ALTER TABLE tokens ALTER COLUMN lp_burned DROP DEFAULT;

ALTER TABLE wallets ALTER COLUMN wallet_age_days DROP NOT NULL;
ALTER TABLE wallets ALTER COLUMN wallet_age_days DROP DEFAULT;
ALTER TABLE wallets ALTER COLUMN core_asset_ratio DROP NOT NULL;
ALTER TABLE wallets ALTER COLUMN core_asset_ratio DROP DEFAULT;
ALTER TABLE wallets ALTER COLUMN portfolio_value_usd DROP NOT NULL;
ALTER TABLE wallets ALTER COLUMN portfolio_value_usd DROP DEFAULT;
ALTER TABLE wallets ALTER COLUMN quality_score DROP NOT NULL;
ALTER TABLE wallets ALTER COLUMN quality_score DROP DEFAULT;
ALTER TABLE wallets ALTER COLUMN copyability_score DROP NOT NULL;
ALTER TABLE wallets ALTER COLUMN copyability_score DROP DEFAULT;

CREATE TABLE IF NOT EXISTS wallet_trades (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) NOT NULL,
  token_in_address VARCHAR(64),
  token_in_symbol VARCHAR(64),
  token_in_amount NUMERIC,
  token_out_address VARCHAR(64),
  token_out_symbol VARCHAR(64),
  token_out_amount NUMERIC,
  trade_direction VARCHAR(16),
  signature VARCHAR(128) NOT NULL,
  slot BIGINT,
  timestamp TIMESTAMPTZ NOT NULL,
  dex VARCHAR(64),
  usd_value NUMERIC,
  execution_price_usd NUMERIC,
  fee_usd NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_wallet_trades_address ON wallet_trades(wallet_address);

CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_signal_unique ON strategy_signal_decisions(strategy_key, signal_id);
