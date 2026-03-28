CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS accounts (
    address     TEXT PRIMARY KEY,
    balance     NUMERIC DEFAULT 0,
    is_contract BOOLEAN DEFAULT FALSE,
    first_seen  TIMESTAMPTZ DEFAULT NOW(),
    last_seen   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    hash         TEXT PRIMARY KEY,
    from_address TEXT NOT NULL REFERENCES accounts(address),
    to_address   TEXT REFERENCES accounts(address),
    value        NUMERIC NOT NULL DEFAULT 0,
    gas          BIGINT NOT NULL,
    gas_price    NUMERIC NOT NULL,
    nonce        BIGINT NOT NULL,
    block_number BIGINT NOT NULL,
    data         BYTEA,
    timestamp    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_vectors (
    address   TEXT PRIMARY KEY REFERENCES accounts(address),
    bytecode  BYTEA,
    embedding vector(128),
    flagged   BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS forensic_flags (
    id          SERIAL PRIMARY KEY,
    tx_hash     TEXT REFERENCES transactions(hash),
    address     TEXT REFERENCES accounts(address),
    flag_type   TEXT NOT NULL,
    severity    TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    description TEXT,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_from    ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_tx_to      ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_tx_block   ON transactions(block_number);
CREATE INDEX IF NOT EXISTS idx_flags_addr ON forensic_flags(address);