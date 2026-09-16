CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_signature_unique ON wallet_trades(wallet_address, signature);
CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
  source_key VARCHAR(128) PRIMARY KEY,
  last_signature VARCHAR(128),
  last_slot BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
