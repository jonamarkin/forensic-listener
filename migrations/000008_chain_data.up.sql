-- Mined blocks, recorded by the block watcher from the node's newHeads subscription.
CREATE TABLE IF NOT EXISTS blocks (
    number      BIGINT PRIMARY KEY,
    hash        TEXT NOT NULL UNIQUE,
    parent_hash TEXT NOT NULL,
    mined_at    TIMESTAMPTZ NOT NULL,
    tx_count    INTEGER NOT NULL,
    gas_used    BIGINT NOT NULL,
    base_fee    NUMERIC,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A transaction is first observed pending. The block watcher later marks it
-- mined, replaced (same sender + nonce mined under another hash) or dropped.
-- block_number was a NOT NULL column that always held 0; it is now NULL until mined.
ALTER TABLE transactions ALTER COLUMN block_number DROP NOT NULL;
UPDATE transactions SET block_number = NULL WHERE block_number = 0;
DROP INDEX IF EXISTS idx_tx_block;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS status              TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS tx_type             SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_priority_fee    NUMERIC,
    ADD COLUMN IF NOT EXISTS mined_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gas_used            BIGINT,
    ADD COLUMN IF NOT EXISTS effective_gas_price NUMERIC,
    ADD COLUMN IF NOT EXISTS receipt_status      SMALLINT,
    ADD COLUMN IF NOT EXISTS created_contract    TEXT REFERENCES accounts (address);

ALTER TABLE transactions
    ADD CONSTRAINT transactions_status_check
        CHECK (status IN ('pending', 'mined', 'replaced', 'dropped')),
    ADD CONSTRAINT transactions_block_fk
        FOREIGN KEY (block_number) REFERENCES blocks (number) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions (block_number) WHERE block_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_pending ON transactions (timestamp) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tx_created_contract ON transactions (created_contract) WHERE created_contract IS NOT NULL;

-- ERC-20 Transfer(address indexed from, address indexed to, uint256 value) events,
-- decoded from receipts. These are the real token movements: the transaction's own
-- "to" is only the token contract.
CREATE TABLE IF NOT EXISTS token_transfers (
    tx_hash       TEXT    NOT NULL REFERENCES transactions (hash) ON DELETE CASCADE,
    log_index     INTEGER NOT NULL,
    block_number  BIGINT  NOT NULL REFERENCES blocks (number) ON DELETE CASCADE,
    token_address TEXT    NOT NULL REFERENCES accounts (address),
    from_address  TEXT    NOT NULL REFERENCES accounts (address),
    to_address    TEXT    NOT NULL REFERENCES accounts (address),
    amount        NUMERIC NOT NULL,
    PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_token_transfers_from  ON token_transfers (from_address);
CREATE INDEX IF NOT EXISTS idx_token_transfers_to    ON token_transfers (to_address);
CREATE INDEX IF NOT EXISTS idx_token_transfers_token ON token_transfers (token_address);
CREATE INDEX IF NOT EXISTS idx_token_transfers_block ON token_transfers (block_number);
