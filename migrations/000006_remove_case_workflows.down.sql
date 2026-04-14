CREATE TABLE IF NOT EXISTS investigation_cases (
    id         BIGSERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    summary    TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'monitoring', 'escalated', 'closed')),
    priority   TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    owner      TEXT NOT NULL DEFAULT 'investigator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investigation_cases_status_updated
    ON investigation_cases(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS case_addresses (
    id         BIGSERIAL PRIMARY KEY,
    case_id    BIGINT NOT NULL REFERENCES investigation_cases(id) ON DELETE CASCADE,
    address    TEXT NOT NULL REFERENCES accounts(address) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'subject',
    note       TEXT NOT NULL DEFAULT '',
    added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT case_addresses_unique UNIQUE (case_id, address)
);

CREATE INDEX IF NOT EXISTS idx_case_addresses_case
    ON case_addresses(case_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_addresses_address
    ON case_addresses(address, added_at DESC);

CREATE TABLE IF NOT EXISTS flag_triage (
    flag_id       BIGINT PRIMARY KEY REFERENCES forensic_flags(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'escalated', 'dismissed', 'resolved')),
    assignee      TEXT NOT NULL DEFAULT '',
    analyst_note  TEXT NOT NULL DEFAULT '',
    case_id       BIGINT REFERENCES investigation_cases(id) ON DELETE SET NULL,
    reviewed_at   TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flag_triage_status_updated
    ON flag_triage(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_flag_triage_case_id
    ON flag_triage(case_id);
