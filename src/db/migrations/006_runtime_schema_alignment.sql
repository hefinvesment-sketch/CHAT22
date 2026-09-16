-- 006_runtime_schema_alignment.sql
-- Alignment migration for runtime persistence and live ingestion

-- 1. Ensure wallet_trades has two-sided swap columns and unique index
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS slot BIGINT;
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS dex VARCHAR(64);
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS token_in_address VARCHAR(64);
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS token_in_symbol VARCHAR(64);
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS token_in_amount NUMERIC(36,18);
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS token_out_address VARCHAR(64);
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS token_out_symbol VARCHAR(64);
ALTER TABLE wallet_trades ADD COLUMN IF NOT EXISTS token_out_amount NUMERIC(36,18);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_signature_unique ON wallet_trades(wallet_address, signature);

-- 2. Add is_eligible_smart_money to wallets table
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_eligible_smart_money BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add missing nullable columns to tokens table
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS top_10_holder_percent NUMERIC;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS is_honeypot_safe BOOLEAN;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS risk_score NUMERIC;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS volume_24h_usd NUMERIC;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS fdv_usd NUMERIC;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS holder_count INT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS token_age_days INT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS top_20_holder_percent NUMERIC;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS dev_holdings_percent NUMERIC;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS liquidity_locked_percent NUMERIC;

-- 4. Add position metadata columns to paper_positions
ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS signal_alpha_score NUMERIC;
ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS strategy_name VARCHAR(128);
ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS strategy_key VARCHAR(64);
ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS allocation_percent NUMERIC;
