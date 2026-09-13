ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_address_format;

UPDATE enrichment_jobs SET status = 'pending' WHERE status = 'failed';
ALTER TABLE enrichment_jobs DROP CONSTRAINT IF EXISTS enrichment_jobs_status_check;
ALTER TABLE enrichment_jobs
    ADD CONSTRAINT enrichment_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'done'));

DROP INDEX IF EXISTS idx_accounts_contract_last_seen;
DROP INDEX IF EXISTS idx_enrichment_done;
DROP INDEX IF EXISTS idx_enrichment_open;
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_claim
    ON enrichment_jobs (status, available_at, locked_at);

DROP INDEX IF EXISTS idx_tx_from_nonce;
DROP INDEX IF EXISTS idx_flags_detected_at;
DROP INDEX IF EXISTS idx_tx_timestamp;
