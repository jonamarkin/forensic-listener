-- One definition of "how risky is this address": the worse of its curated label and
-- its most severe forensic flag. It replaces six hand-copied CASE expressions, and fixes
-- a precedence bug where a seeded label of 'none' hid a high-severity flag.
-- Filters on address are pushed down through the GROUP BY, so single-address and
-- LATERAL lookups stay index-driven.
CREATE OR REPLACE VIEW address_risk AS
WITH ranked AS (
    SELECT
        a.address,
        COUNT(f.id) AS flag_count,
        COUNT(f.id) FILTER (WHERE f.severity = 'high') AS high_flag_count,
        COALESCE(MAX(CASE f.severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END), 0) AS flag_rank,
        CASE MAX(ke.risk_level) WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END AS label_rank
    FROM accounts a
    LEFT JOIN forensic_flags f ON f.address = a.address
    LEFT JOIN known_entities ke ON ke.address = a.address
    GROUP BY a.address
)
SELECT
    address,
    flag_count,
    high_flag_count,
    (ARRAY['none', 'low', 'medium', 'high'])[flag_rank + 1] AS flag_risk,
    (ARRAY['none', 'low', 'medium', 'high'])[label_rank + 1] AS label_risk,
    (ARRAY['none', 'low', 'medium', 'high'])[GREATEST(flag_rank, label_rank) + 1] AS risk_level
FROM ranked;

-- Risk for one address. Joining the view directly to a row set makes PostgreSQL
-- aggregate every account first (87 ms at 50k accounts), while a parameterised
-- lookup uses the address filter pushdown (0.1 ms). Apply it only to rows that
-- survive a query's LIMIT.
CREATE OR REPLACE FUNCTION address_risk_level(addr TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT risk_level FROM address_risk WHERE address = addr), 'none')
$$;

-- Structured, queryable evidence (path, hashes, similarity) next to the prose description.
ALTER TABLE forensic_flags ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_flags_type_detected ON forensic_flags (flag_type, detected_at DESC);

-- Never written by any code path; the UI always showed "not verified".
DROP TABLE IF EXISTS contract_metadata;

-- Never written either (always 0). Balances are now read live from the node.
ALTER TABLE accounts DROP COLUMN IF EXISTS balance;
