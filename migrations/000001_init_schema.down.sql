DROP INDEX IF EXISTS idx_flags_addr;
DROP INDEX IF EXISTS idx_tx_block;
DROP INDEX IF EXISTS idx_tx_to;
DROP INDEX IF EXISTS idx_tx_from;

DROP TABLE IF EXISTS forensic_flags;
DROP TABLE IF EXISTS contract_vectors;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;

DROP EXTENSION IF EXISTS vector;