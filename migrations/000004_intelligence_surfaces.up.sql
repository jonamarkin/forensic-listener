CREATE TABLE IF NOT EXISTS contract_metadata (
    address          TEXT PRIMARY KEY REFERENCES accounts(address) ON DELETE CASCADE,
    abi              JSONB,
    source_code      TEXT,
    decompiled_code  TEXT,
    compiler_version TEXT,
    verified         BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_behavior_vectors (
    address    TEXT PRIMARY KEY REFERENCES accounts(address) ON DELETE CASCADE,
    embedding  vector(128) NOT NULL,
    features   JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_behavior_updated_at
    ON account_behavior_vectors(updated_at DESC);
