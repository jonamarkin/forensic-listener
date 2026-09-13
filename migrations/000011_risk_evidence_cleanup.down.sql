ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS contract_metadata (
    address          TEXT PRIMARY KEY REFERENCES accounts(address) ON DELETE CASCADE,
    abi              JSONB,
    source_code      TEXT,
    decompiled_code  TEXT,
    compiler_version TEXT,
    verified         BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_flags_type_detected;
ALTER TABLE forensic_flags DROP COLUMN IF EXISTS evidence;

DROP FUNCTION IF EXISTS address_risk_level(TEXT);
DROP VIEW IF EXISTS address_risk;
