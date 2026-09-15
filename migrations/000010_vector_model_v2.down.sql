DROP INDEX IF EXISTS idx_account_behavior_hnsw;
TRUNCATE account_behavior_vectors;
ALTER TABLE account_behavior_vectors DROP COLUMN IF EXISTS sample_size;
ALTER TABLE account_behavior_vectors ALTER COLUMN embedding TYPE vector(128);

DROP INDEX IF EXISTS idx_contract_vectors_hnsw;
DROP INDEX IF EXISTS idx_contract_vectors_skeleton;
ALTER TABLE contract_vectors
    DROP COLUMN IF EXISTS embedded_at,
    DROP COLUMN IF EXISTS skeleton_hash;
ALTER TABLE contract_vectors ALTER COLUMN embedding TYPE vector(128) USING NULL::vector(128);
