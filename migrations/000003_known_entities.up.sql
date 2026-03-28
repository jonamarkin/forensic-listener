CREATE TABLE IF NOT EXISTS known_entities (
    address     TEXT PRIMARY KEY REFERENCES accounts(address) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    entity_type TEXT NOT NULL DEFAULT 'wallet',
    risk_level  TEXT NOT NULL DEFAULT 'none' CHECK (risk_level IN ('none', 'low', 'medium', 'high')),
    is_hub      BOOLEAN NOT NULL DEFAULT FALSE,
    source      TEXT NOT NULL DEFAULT 'manual',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_known_entities_type_hub
    ON known_entities (entity_type, is_hub, risk_level);
