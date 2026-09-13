-- Version 2 of both vector models.
--
-- Bytecode: the v1 embedding was a byte-value histogram. Large contracts all
-- converge on the same byte distribution, so unrelated code scored ~0.99 and every
-- similar_bytecode flag it produced was noise. v2 walks the code as EVM opcodes,
-- drops PUSH operands and the compiler metadata trailer, and feature-hashes opcode
-- n-grams with random signs into 1024 dimensions (unrelated code scores ~0).
-- Stored bytecode is kept; the application re-embeds it at startup.
DELETE FROM forensic_flags WHERE flag_type = 'similar_bytecode';
ALTER TABLE contract_vectors ALTER COLUMN embedding TYPE vector(1024) USING NULL::vector(1024);
UPDATE contract_vectors SET flagged = FALSE;
ALTER TABLE contract_vectors
    ADD COLUMN IF NOT EXISTS skeleton_hash TEXT,
    ADD COLUMN IF NOT EXISTS embedded_at   TIMESTAMPTZ;

-- Exact clone families share an opcode skeleton hash.
CREATE INDEX IF NOT EXISTS idx_contract_vectors_skeleton ON contract_vectors (skeleton_hash);
-- Approximate nearest-neighbour index (HNSW graph) for cosine distance.
CREATE INDEX IF NOT EXISTS idx_contract_vectors_hnsw
    ON contract_vectors USING hnsw (embedding vector_cosine_ops);

-- Behaviour: v1 padded 11 unscaled features into 128 dimensions, so large counts
-- dominated and most accounts looked ~99% alike. v2 stores exactly 11 scaled,
-- centred features. The rows are derived data and are rebuilt by the maintenance job.
TRUNCATE account_behavior_vectors;
ALTER TABLE account_behavior_vectors ALTER COLUMN embedding TYPE vector(11);
ALTER TABLE account_behavior_vectors
    ADD COLUMN IF NOT EXISTS sample_size INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_account_behavior_hnsw
    ON account_behavior_vectors USING hnsw (embedding vector_cosine_ops);
