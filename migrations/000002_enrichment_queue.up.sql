CREATE TABLE IF NOT EXISTS enrichment_jobs (
    tx_hash      TEXT PRIMARY KEY REFERENCES transactions(hash) ON DELETE CASCADE,
    status       TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done')),
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at    TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_claim
    ON enrichment_jobs (status, available_at, locked_at);

DELETE FROM forensic_flags AS older
USING forensic_flags AS newer
WHERE older.id < newer.id
  AND older.tx_hash = newer.tx_hash
  AND older.address = newer.address
  AND older.flag_type = newer.flag_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_forensic_flags_unique_signal
    ON forensic_flags (tx_hash, address, flag_type);
