-- HEF AlphaGraph Institutional Database Schema
-- Version 2.0.0
-- Comprehensive double-entry ledger, point-in-time snapshots, risk events, and wallet graph

CREATE TABLE IF NOT EXISTS wallets (
    address VARCHAR(64) PRIMARY KEY,
    label VARCHAR(128),
    first_seen_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    wallet_age_days INT NOT NULL DEFAULT 0,
    core_asset_ratio NUMERIC(5, 4) NOT NULL DEFAULT 0.0,
    portfolio_value_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.0,
    trade_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
    quality_score INT NOT NULL DEFAULT 50,
    copyability_score INT NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_balances (
    id BIGSERIAL PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    token_address VARCHAR(64) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    usd_value NUMERIC(16, 2) NOT NULL,
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_wallet ON wallet_balances(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_timestamp ON wallet_balances(snapshot_timestamp);

CREATE TABLE IF NOT EXISTS wallet_metric_snapshots (
    id BIGSERIAL PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    as_of_timestamp TIMESTAMPTZ NOT NULL,
    portfolio_value_usd NUMERIC(16, 2) NOT NULL,
    win_rate NUMERIC(5, 2) NOT NULL,
    profit_factor NUMERIC(8, 2) NOT NULL,
    max_drawdown_percent NUMERIC(5, 2) NOT NULL,
    quality_score INT NOT NULL,
    consistency_score INT NOT NULL,
    return_score INT NOT NULL,
    drawdown_score INT NOT NULL,
    total_trades_count INT NOT NULL,
    rolling_30d_trades INT NOT NULL,
    rolling_30d_return NUMERIC(8, 2) NOT NULL,
    momentum_state VARCHAR(32) NOT NULL,
    copyability_score INT NOT NULL,
    source_return_percent NUMERIC(8, 2) NOT NULL,
    achievable_return_percent NUMERIC(8, 2) NOT NULL,
    latency_loss_percent NUMERIC(5, 2) NOT NULL,
    slippage_loss_percent NUMERIC(5, 2) NOT NULL,
    fee_loss_percent NUMERIC(5, 2) NOT NULL,
    wallet_score INT NOT NULL DEFAULT 50,
    eligibility_status VARCHAR(32) NOT NULL DEFAULT 'INELIGIBLE',
    is_eligible_smart_money BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_wallet_metrics_point_in_time ON wallet_metric_snapshots(wallet_address, as_of_timestamp);

CREATE TABLE IF NOT EXISTS wallet_trades (
    id BIGSERIAL PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    signature VARCHAR(128) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    token_address VARCHAR(64) NOT NULL,
    token_symbol VARCHAR(32) NOT NULL,
    trade_direction VARCHAR(16) NOT NULL,
    token_amount NUMERIC(36, 18) NOT NULL,
    execution_price_usd NUMERIC(24, 8) NOT NULL,
    usd_value NUMERIC(16, 2) NOT NULL,
    cost_basis_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.0,
    realized_pnl_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.0,
    holding_time_seconds INT NOT NULL DEFAULT 0,
    is_airdrop_or_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    fee_usd NUMERIC(12, 4) NOT NULL DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_wallet_trades_wallet ON wallet_trades(wallet_address, timestamp);

CREATE TABLE IF NOT EXISTS wallet_relationships (
    id VARCHAR(64) PRIMARY KEY,
    source_wallet VARCHAR(64) NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    target_wallet VARCHAR(64) NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    relationship_type VARCHAR(32) NOT NULL,
    confidence_score INT NOT NULL,
    funding_overlap BOOLEAN NOT NULL DEFAULT FALSE,
    timing_similarity_score NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_rel_source ON wallet_relationships(source_wallet);
CREATE INDEX IF NOT EXISTS idx_wallet_rel_target ON wallet_relationships(target_wallet);

CREATE TABLE IF NOT EXISTS tokens (
    address VARCHAR(64) PRIMARY KEY,
    symbol VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    decimals INT NOT NULL DEFAULT 6,
    liquidity_usd NUMERIC(16, 2) NOT NULL DEFAULT 0,
    market_cap_usd NUMERIC(16, 2) NOT NULL DEFAULT 0,
    mint_authority_revoked BOOLEAN NOT NULL DEFAULT TRUE,
    freeze_authority_revoked BOOLEAN NOT NULL DEFAULT TRUE,
    lp_burned BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_prices (
    id BIGSERIAL PRIMARY KEY,
    token_address VARCHAR(64) NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
    price_usd NUMERIC(24, 8) NOT NULL,
    source VARCHAR(32) NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL DEFAULT 1.0,
    timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_prices_address_time ON token_prices(token_address, timestamp);

CREATE TABLE IF NOT EXISTS signals (
    id VARCHAR(64) PRIMARY KEY,
    token_address VARCHAR(64) NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
    token_symbol VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    alpha_score INT NOT NULL,
    signal_state VARCHAR(32) NOT NULL,
    decision_status VARCHAR(32) NOT NULL,
    rejection_reason TEXT,
    rejection_code VARCHAR(64),
    independent_elite_count INT NOT NULL,
    total_smart_money_inflow_usd NUMERIC(16, 2) NOT NULL,
    price_at_signal NUMERIC(24, 8) NOT NULL,
    price_displacement_from_vwap_percent NUMERIC(6, 2) NOT NULL,
    market_regime VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_token ON signals(token_address);
CREATE INDEX IF NOT EXISTS idx_signals_decision ON signals(decision_status);

CREATE TABLE IF NOT EXISTS signal_wallets (
    id BIGSERIAL PRIMARY KEY,
    signal_id VARCHAR(64) NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    wallet_address VARCHAR(64) NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    trade_usd NUMERIC(16, 2) NOT NULL,
    conviction_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    is_independent BOOLEAN NOT NULL DEFAULT TRUE,
    quality_score INT NOT NULL DEFAULT 50
);
CREATE INDEX IF NOT EXISTS idx_signal_wallets_signal ON signal_wallets(signal_id);

CREATE TABLE IF NOT EXISTS signal_features (
    signal_id VARCHAR(64) PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
    trader_skill_score INT NOT NULL,
    copyability_score INT NOT NULL,
    independent_consensus_score INT NOT NULL,
    conviction_surprise_score INT NOT NULL,
    smart_money_acceleration_score INT NOT NULL,
    entry_quality_score INT NOT NULL,
    liquidity_token_quality_score INT NOT NULL,
    regime_fit_score INT NOT NULL,
    emerging_trader_score INT NOT NULL,
    total_penalties INT NOT NULL DEFAULT 0,
    penalties_detail JSONB
);

CREATE TABLE IF NOT EXISTS signal_outcomes (
    signal_id VARCHAR(64) PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
    return_5m_percent NUMERIC(6, 2),
    return_15m_percent NUMERIC(6, 2),
    return_1h_percent NUMERIC(6, 2),
    return_4h_percent NUMERIC(6, 2),
    return_24h_percent NUMERIC(6, 2),
    return_3d_percent NUMERIC(6, 2),
    return_7d_percent NUMERIC(6, 2),
    max_favorable_excursion_percent NUMERIC(6, 2),
    max_adverse_excursion_percent NUMERIC(6, 2),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_portfolios (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    strategy_key VARCHAR(64) NOT NULL DEFAULT 'HEF_INSTITUTIONAL',
    starting_capital_usd NUMERIC(16, 2) NOT NULL DEFAULT 5000.00,
    cash_usd NUMERIC(16, 2) NOT NULL DEFAULT 5000.00,
    positions_value_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    total_equity_usd NUMERIC(16, 2) NOT NULL DEFAULT 5000.00,
    realized_pnl_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    unrealized_pnl_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    total_fees_paid_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_positions (
    id VARCHAR(64) PRIMARY KEY,
    portfolio_id VARCHAR(64) NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    token_symbol VARCHAR(32) NOT NULL,
    token_address VARCHAR(64) NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
    opened_at TIMESTAMPTZ NOT NULL,
    open_price NUMERIC(24, 8) NOT NULL,
    current_price NUMERIC(24, 8) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    cost_basis_usd NUMERIC(16, 2) NOT NULL,
    current_value_usd NUMERIC(16, 2) NOT NULL,
    unrealized_pnl_usd NUMERIC(16, 2) NOT NULL,
    stop_loss_price NUMERIC(24, 8) NOT NULL,
    take_profit_price NUMERIC(24, 8) NOT NULL,
    trailing_stop_price NUMERIC(24, 8),
    signal_id VARCHAR(64) REFERENCES signals(id),
    detection_latency_ms INT NOT NULL,
    slippage_percent NUMERIC(6, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_positions_portfolio ON paper_positions(portfolio_id);

CREATE TABLE IF NOT EXISTS paper_trades (
    id VARCHAR(64) PRIMARY KEY,
    portfolio_id VARCHAR(64) NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    token_symbol VARCHAR(32) NOT NULL,
    token_address VARCHAR(64) NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL,
    open_price NUMERIC(24, 8) NOT NULL,
    close_price NUMERIC(24, 8) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    cost_basis_usd NUMERIC(16, 2) NOT NULL,
    proceeds_usd NUMERIC(16, 2) NOT NULL,
    realized_pnl_usd NUMERIC(16, 2) NOT NULL,
    return_percent NUMERIC(8, 2) NOT NULL,
    exit_reason VARCHAR(64) NOT NULL,
    fees_paid_usd NUMERIC(16, 4) NOT NULL,
    slippage_paid_usd NUMERIC(16, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_trades_portfolio ON paper_trades(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_closed_at ON paper_trades(closed_at);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id BIGSERIAL PRIMARY KEY,
    portfolio_id VARCHAR(64) NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    equity_usd NUMERIC(16, 2) NOT NULL,
    cash_usd NUMERIC(16, 2) NOT NULL,
    positions_value_usd NUMERIC(16, 2) NOT NULL,
    drawdown_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    sol_benchmark_usd NUMERIC(16, 2),
    btc_benchmark_usd NUMERIC(16, 2),
    eth_benchmark_usd NUMERIC(16, 2)
);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_time ON portfolio_snapshots(portfolio_id, timestamp);

CREATE TABLE IF NOT EXISTS risk_events (
    id BIGSERIAL PRIMARY KEY,
    portfolio_id VARCHAR(64),
    signal_id VARCHAR(64),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(64) NOT NULL,
    rejection_code VARCHAR(64),
    reason TEXT NOT NULL,
    details JSONB
);
CREATE INDEX IF NOT EXISTS idx_risk_events_time ON risk_events(timestamp);

CREATE TABLE IF NOT EXISTS provider_health (
    id BIGSERIAL PRIMARY KEY,
    provider_name VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    latency_ms INT,
    message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_health_name_time ON provider_health(provider_name, checked_at);

CREATE TABLE IF NOT EXISTS backtest_runs (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    mode VARCHAR(32) NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    total_trades INT NOT NULL,
    win_rate_percent NUMERIC(5, 2) NOT NULL,
    total_return_percent NUMERIC(8, 2) NOT NULL,
    profit_factor NUMERIC(8, 2) NOT NULL,
    max_drawdown_percent NUMERIC(5, 2) NOT NULL,
    sharpe_ratio NUMERIC(6, 2) NOT NULL,
    sol_benchmark_return_percent NUMERIC(8, 2) NOT NULL,
    btc_benchmark_return_percent NUMERIC(8, 2) NOT NULL,
    alpha_over_benchmark_percent NUMERIC(8, 2) NOT NULL,
    robustness_score INT NOT NULL,
    walk_forward_splits JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
