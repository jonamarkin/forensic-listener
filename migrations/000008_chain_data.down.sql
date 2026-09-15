DROP TABLE IF EXISTS token_transfers;

DROP INDEX IF EXISTS idx_tx_created_contract;
DROP INDEX IF EXISTS idx_tx_pending;
DROP INDEX IF EXISTS idx_tx_block;

ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_block_fk,
    DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE transactions
    DROP COLUMN IF EXISTS created_contract,
    DROP COLUMN IF EXISTS receipt_status,
    DROP COLUMN IF EXISTS effective_gas_price,
    DROP COLUMN IF EXISTS gas_used,
    DROP COLUMN IF EXISTS mined_at,
    DROP COLUMN IF EXISTS max_priority_fee,
    DROP COLUMN IF EXISTS tx_type,
    DROP COLUMN IF EXISTS status;

UPDATE transactions SET block_number = 0 WHERE block_number IS NULL;
ALTER TABLE transactions ALTER COLUMN block_number SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions (block_number);

DROP TABLE IF EXISTS blocks;
