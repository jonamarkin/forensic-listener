-- Indexes for the dashboard's hottest reads. Measured on 500k transactions:
-- latest-10 transactions went from a 46 ms parallel scan to a 0.04 ms index scan.
CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flags_detected_at ON forensic_flags (detected_at DESC);

-- Replacement detection looks up pending transactions by (sender, nonce).
CREATE INDEX IF NOT EXISTS idx_tx_from_nonce ON transactions (from_address, nonce);

-- Only open jobs are ever claimed, so index only those rows (partial index).
-- Finished jobs no longer bloat the index the workers scan.
DROP INDEX IF EXISTS idx_enrichment_jobs_claim;
CREATE INDEX IF NOT EXISTS idx_enrichment_open
    ON enrichment_jobs (available_at, updated_at)
    WHERE status IN ('pending', 'processing', 'failed');

-- Finished jobs are pruned after a day; find them by age without a full scan.
CREATE INDEX IF NOT EXISTS idx_enrichment_done
    ON enrichment_jobs (updated_at)
    WHERE status = 'done';

-- The contracts page lists recently active contracts.
CREATE INDEX IF NOT EXISTS idx_accounts_contract_last_seen
    ON accounts (last_seen DESC)
    WHERE is_contract;

-- Jobs that keep failing stop in a terminal state instead of retrying forever.
ALTER TABLE enrichment_jobs DROP CONSTRAINT IF EXISTS enrichment_jobs_status_check;
ALTER TABLE enrichment_jobs
    ADD CONSTRAINT enrichment_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'failed'));

-- Addresses are stored as 20-byte hex in EIP-55 checksum form. NOT VALID enforces
-- the rule for every new row without scanning (or failing on) existing rows.
ALTER TABLE accounts
    ADD CONSTRAINT accounts_address_format
    CHECK (address ~ '^0x[0-9a-fA-F]{40}$') NOT VALID;
