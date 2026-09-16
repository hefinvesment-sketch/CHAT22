ALTER TABLE strategy_signal_decisions ADD COLUMN IF NOT EXISTS strategy_name VARCHAR(128);
ALTER TABLE strategy_signal_decisions ADD COLUMN IF NOT EXISTS token_address VARCHAR(64);
ALTER TABLE strategy_signal_decisions ADD COLUMN IF NOT EXISTS token_symbol VARCHAR(64);
ALTER TABLE strategy_signal_decisions ADD COLUMN IF NOT EXISTS allocated_position_usd NUMERIC(16,2);
ALTER TABLE strategy_signal_decisions ALTER COLUMN alpha_score DROP NOT NULL;
