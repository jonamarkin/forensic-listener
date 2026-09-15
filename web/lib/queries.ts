import type { Engine } from "@/components/dashboard/source-tag";

export type QuerySnippet = {
  engine: Engine;
  title: string;
  note?: string;
  text: string;
};

// Abridged copies of the queries in store/*.go, shown in the UI so each panel can
// be explained in terms of the database work behind it. Keep them in sync.
export const QUERIES = {
  liveCounts: {
    engine: "postgres",
    title: "live counters",
    note: "Exact counts run every 30 s; between refreshes the API adds an index-backed count of newer rows. One snapshot is shared by every open tab.",
    text: `
SELECT
  (SELECT COUNT(*) FROM transactions WHERE timestamp > $exact_count_time),  -- idx_tx_timestamp
  (SELECT COUNT(*) FROM transactions WHERE status = 'pending'),             -- partial idx_tx_pending
  (SELECT COUNT(*) FROM forensic_flags),
  (SELECT MAX(number) FROM blocks);`,
  },
  enrichmentQueue: {
    engine: "postgres",
    title: "claim the next enrichment job",
    note: "The job table is a transactional outbox: the transaction and its job commit together. SKIP LOCKED lets workers claim jobs concurrently without ever taking the same row.",
    text: `
WITH candidate AS (
  SELECT tx_hash FROM enrichment_jobs
  WHERE status IN ('pending', 'processing')        -- partial index idx_enrichment_open
    AND available_at <= NOW()
    AND (status = 'pending' OR locked_at <= $lease_expiry)
  ORDER BY available_at, updated_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE enrichment_jobs ej
SET status = 'processing', attempts = attempts + 1, locked_at = NOW()
FROM candidate WHERE ej.tx_hash = candidate.tx_hash
RETURNING ej.tx_hash;`,
  },
  networkHistory: {
    engine: "postgres",
    title: "hourly network history",
    note: "Reads a pre-aggregated rollup refreshed every 30 s, and fills empty hours with zeros so the chart is drawn to time scale.",
    text: `
SELECT s.bucket,
       COALESCE(n.transaction_count, 0),
       COALESCE(n.unique_addresses, 0)
FROM generate_series(date_trunc('hour', NOW()) - make_interval(hours => $hours - 1),
                     date_trunc('hour', NOW()), INTERVAL '1 hour') AS s(bucket)
LEFT JOIN network_hourly n ON n.bucket = s.bucket
ORDER BY s.bucket;`,
  },
  accountProfile: {
    engine: "postgres",
    title: "account profile and risk",
    note: "Risk is the worse of the curated label and the most severe flag, defined once in the address_risk view.",
    text: `
SELECT a.address, a.first_seen, a.last_seen,
       sent.n, received.n, counterparties.n,
       r.flag_count, r.risk_level, r.flag_risk, r.label_risk,
       ke.name, ke.entity_type
FROM accounts a
CROSS JOIN sent CROSS JOIN received CROSS JOIN counterparties
JOIN address_risk r ON r.address = a.address
LEFT JOIN known_entities ke ON ke.address = a.address
WHERE a.address = $1;`,
  },
  counterparties: {
    engine: "postgres",
    title: "top counterparties",
    text: `
WITH related AS (
  SELECT to_address AS counterparty, 1 AS sent, 0 AS received, value, timestamp
  FROM transactions WHERE from_address = $1 AND to_address IS NOT NULL
  UNION ALL
  SELECT from_address, 0, 1, value, timestamp
  FROM transactions WHERE to_address = $1
)
SELECT counterparty, SUM(sent), SUM(received), COUNT(*) AS total, SUM(value)
FROM related
GROUP BY counterparty
ORDER BY total DESC
LIMIT 8;`,
  },
  similarAccounts: {
    engine: "pgvector",
    title: "nearest behaviour neighbours",
    note: "<=> is cosine distance. The ORDER BY is served by an HNSW index; risk is looked up only for the 8 rows kept.",
    text: `
SELECT nn.address, nn.similarity, address_risk_level(nn.address)
FROM (
  SELECT address,
         1 - (embedding <=> (SELECT embedding FROM account_behavior_vectors WHERE address = $1)) AS similarity
  FROM account_behavior_vectors
  WHERE address <> $1 AND sample_size >= 3
  ORDER BY embedding <=> (SELECT embedding FROM account_behavior_vectors WHERE address = $1)
  LIMIT 8
) nn;`,
  },
  neighbourhood: {
    engine: "neo4j",
    title: "neighbourhood expansion",
    note: "Each hop level has its own budget and stops expanding once it is met, so a hub cannot trigger an unbounded search.",
    text: `
MATCH (center:Account {address: $address})
CALL {
  WITH center
  OPTIONAL MATCH p = (center)-[:SENT|TRANSFERRED*1]-(:Account) RETURN p LIMIT $per_level
  UNION ALL
  WITH center
  OPTIONAL MATCH p = (center)-[:SENT|TRANSFERRED*2]-(:Account) RETURN p LIMIT $per_level
}
RETURN center, collect(p) AS paths;`,
  },
  tracePath: {
    engine: "neo4j",
    title: "shortest directed path",
    note: "shortestPath runs a bidirectional breadth-first search and stops at the first hit. The same question in SQL is a recursive CTE whose cost multiplies per hop.",
    text: `
MATCH (src:Account {address: $from}), (dst:Account {address: $to})
MATCH p = shortestPath((src)-[:SENT|TRANSFERRED*1..4]->(dst))
RETURN [n IN nodes(p) | n.address] AS path,
       [r IN relationships(p) | coalesce(r.hash, r.tx_hash)] AS tx_hashes;`,
  },
  topHubs: {
    engine: "neo4j",
    title: "highest-degree accounts",
    note: "COUNT { } on a single typed hop is answered from Neo4j's stored degree counts.",
    text: `
MATCH (acct:Account)
WITH acct,
     COUNT { (acct)-[:SENT|TRANSFERRED]->() } AS outgoing,
     COUNT { (acct)<-[:SENT|TRANSFERRED]-() } AS incoming
RETURN acct.address, outgoing, incoming, outgoing + incoming AS degree
ORDER BY degree DESC
LIMIT 8;`,
  },
  returnPath: {
    engine: "neo4j",
    title: "circular-flow detector",
    note: "Runs during enrichment when a transfer from → to arrives: is there an earlier, time-ordered path back?",
    text: `
MATCH (dst:Account {address: $to}), (src:Account {address: $from})
MATCH p = (dst)-[:SENT|TRANSFERRED*1..3]->(src)
WHERE all(r IN relationships(p) WHERE r.timestamp >= datetime($since) AND r.timestamp <= datetime($before))
  AND all(i IN range(0, size(relationships(p)) - 2)
          WHERE relationships(p)[i].timestamp <= relationships(p)[i + 1].timestamp)
RETURN [n IN nodes(p) | n.address] AS path
ORDER BY length(p)
LIMIT 1;`,
  },
  similarContracts: {
    engine: "pgvector",
    title: "nearest bytecode neighbours",
    note: "Embeddings hash opcode 2- and 3-grams (PUSH operands and compiler metadata removed) into 1024 signed dimensions. Exact clones also share a skeleton hash.",
    text: `
SELECT address,
       1 - (embedding <=> (SELECT embedding FROM contract_vectors WHERE address = $1)) AS similarity,
       skeleton_hash = (SELECT skeleton_hash FROM contract_vectors WHERE address = $1) AS same_skeleton
FROM contract_vectors
WHERE address <> $1 AND embedding IS NOT NULL
ORDER BY embedding <=> (SELECT embedding FROM contract_vectors WHERE address = $1)  -- HNSW index
LIMIT 8;`,
  },
  blockIngest: {
    engine: "postgres",
    title: "promote pending transactions when mined",
    note: "One statement inserts transactions first seen in the block and upgrades ones already seen pending.",
    text: `
INSERT INTO transactions (hash, from_address, ..., status, block_number, mined_at, gas_used)
SELECT ... FROM unnest($hashes, $froms, ...) AS t(...)
ON CONFLICT (hash) DO UPDATE
  SET status = 'mined', block_number = EXCLUDED.block_number,
      mined_at = EXCLUDED.mined_at, gas_used = EXCLUDED.gas_used;

-- Same sender and nonce mined under another hash: the pending one was replaced.
UPDATE transactions p SET status = 'replaced'
FROM unnest($froms, $nonces, $hashes) AS m(from_address, nonce, hash)
WHERE p.status = 'pending' AND p.from_address = m.from_address
  AND p.nonce = m.nonce AND p.hash <> m.hash;`,
  },
} satisfies Record<string, QuerySnippet>;
