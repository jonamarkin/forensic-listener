# Forensic Listener

An Ethereum investigation workspace built on **two database engines serving three data models**:

| Store | Data model | What it is used for |
| --- | --- | --- |
| **PostgreSQL 16** | relational | System of record: transactions, blocks, token transfers, labels, flags, the enrichment queue, dashboard aggregates |
| **Neo4j 5** | property graph | Value-flow traversal: neighbourhoods, shortest paths, time-ordered loop detection |
| **pgvector** (extension inside PostgreSQL) | vector | Similarity: clones of risky contracts, accounts that behave alike |

A Go backend ingests live data from an Ethereum node, commits it to PostgreSQL, projects it into Neo4j and pgvector, runs forensic detectors, and serves a JSON/SSE API. A Next.js frontend presents the investigation workflow and labels every panel with the store that produced it.

---

## Architecture

```text
 Ethereum node ──pending txs (WS)──▶ ingest workers ──┐
      │                                               │  one ACID transaction:
      └──new block headers (WS)──▶ block watcher ─────┤  accounts + transaction + enrichment job
                                                      ▼
                                              ┌──────────────┐
                                              │  PostgreSQL  │◀── API reads (records, aggregates, risk)
                                              │  + pgvector  │◀── API reads (similarity)
                                              └──────┬───────┘
                                  claim job          │ FOR UPDATE SKIP LOCKED
                                                     ▼
                                           enrichment workers ──MERGE edges──▶ Neo4j ◀── API reads (paths)
                                             │  eth_getCode (first sight of a contract)
                                             │  embed bytecode ─▶ pgvector
                                             └─ detectors ─▶ forensic_flags (PostgreSQL)
```

### One transaction, end to end

1. **Observe.** The node pushes a full pending transaction (`eth_subscribe newPendingTransactions`). Subscriptions re-connect with backoff if they drop (`client/eth.go`).
2. **Commit.** An ingest worker stores the sender, the recipient, the transaction (`status = 'pending'`) and an `enrichment_jobs` row in **one transaction**. This is a *transactional outbox*: nothing that is stored can be missed by enrichment (`store/postgres.go: SaveTransaction`).
3. **Mine.** When a block arrives, the block watcher fetches the block and all receipts (`eth_getBlockReceipts`) and, again in one transaction, promotes known transactions to `mined`, inserts ones never seen pending, marks same-sender-and-nonce losers as `replaced`, decodes ERC-20 `Transfer` logs and records contract creations. Reorgs at the same height are undone first (`SaveBlock`).
4. **Enrich.** Workers claim jobs with `FOR UPDATE SKIP LOCKED` and lease expiry. For each transaction they `MERGE` a `:SENT` edge (and `:TRANSFERRED` edges for token transfers) into Neo4j, fetch and embed a contract's bytecode the first time it is seen, and run the detectors. Every write is idempotent, so a retried job is harmless. Failures back off exponentially and park as `failed` after 6 attempts (`ingestion/enrichment.go`).
5. **Maintain.** Every 30 s: refresh the hourly rollup, rebuild behaviour vectors for recently active accounts, re-embed stored bytecode after a model change, prune finished jobs, and mark transactions still pending after 3 h as `dropped` (`ingestion/maintenance.go`).
6. **Serve.** The API builds one live snapshot every 2 s and streams it to every client over server-sent events (`api/snapshot.go`).

### Consistency model

PostgreSQL is always correct *now*. Neo4j and the vector tables are **eventually consistent projections** that lag by the length of the enrichment queue, which the dashboard shows live. If Neo4j is down, ingestion continues and the queue replays when it returns.

---

## Why these databases

### PostgreSQL: records, integrity and the queue

- Foreign keys tie transactions to accounts and blocks, flags to transactions, token transfers to all three.
- `NUMERIC` for wei: values reach 2²⁵⁶−1, and `BIGINT` overflows above ~9.22 ETH.
- A unique index `(tx_hash, address, flag_type)` makes detectors idempotent.
- The queue needs no separate broker: `SKIP LOCKED` gives concurrent workers disjoint jobs.
- Risk is **derived, not stored**: the `address_risk` view takes the worse of an address's curated label and its most severe flag.

### Neo4j: traversal cost that does not multiply per hop

Measured on identical data (50k accounts, 500k transfers), averaged over five real transaction pairs; both engines returned the same answers:

| Return-path check | PostgreSQL recursive CTE | Neo4j variable-length | Neo4j `shortestPath` |
| --- | ---: | ---: | ---: |
| ≤ 3 hops | 1.7 ms | 1.2 ms | 1.8 ms |
| ≤ 4 hops | 7.2 ms | 2.4 ms | 0.8 ms |
| ≤ 5 hops | 39.3 ms | 11.6 ms | 1.2 ms |

At three hops the engines tie. The case for Neo4j is how cost grows with depth, and how directly variable-length, time-ordered path conditions can be expressed:

```cypher
MATCH (dst:Account {address: $to}), (src:Account {address: $from})
MATCH p = (dst)-[:SENT|TRANSFERRED*1..3]->(src)
WHERE all(r IN relationships(p) WHERE r.timestamp >= datetime($since) AND r.timestamp <= datetime($before))
  AND all(i IN range(0, size(relationships(p)) - 2)
          WHERE relationships(p)[i].timestamp <= relationships(p)[i + 1].timestamp)
RETURN [n IN nodes(p) | n.address] AS path ORDER BY length(p) LIMIT 1
```

### pgvector: similarity next to the data it describes

Vectors live in the same database as labels and flags, so a nearest-neighbour search and its risk context are one SQL query. HNSW indexes serve the `ORDER BY embedding <=> query` scans (50k vectors: 31–39 ms exact scan, 1–3 ms HNSW, with recall tunable through `hnsw.ef_search`).

**Bytecode model.** Runtime code is read as EVM opcodes, with PUSH operands and the compiler metadata trailer removed. Opcode 2- and 3-grams are feature-hashed into 1,024 dimensions with random signs, so unrelated code cancels out. Exact clones also share an opcode-skeleton hash. Calibrated on compiled contracts (`store/embedding_test.go`):

| Pair | v1 byte histogram | v2 opcode n-grams |
| --- | ---: | ---: |
| exact clone | 0.999 | 1.000 |
| modified variant | 0.980 | 0.909 |
| unrelated contracts | 0.94–0.98 | 0.53–0.76 |
| random bytes | 0.990 | 0.028 |

A contract is flagged when it scores ≥ 0.85 against a contract labelled or flagged as medium or high risk.

**Behaviour model.** Eleven interpretable features (sending and receiving volume, send/receive balance, average value and fee, counterparty spread, contract-call share, burstiness, night and weekend activity, active span) are scaled to [−1, 1] and stored as `vector(11)`.

---

## Data model

```text
blocks (number PK) ◀── transactions.block_number
accounts (address PK, CHECK 0x+40 hex)
  ◀── transactions.from_address / to_address / created_contract
  ◀── token_transfers.token_address / from_address / to_address
  ◀── known_entities.address        (1:1 curated label)
  ◀── contract_vectors.address      (1:1 bytecode, vector(1024), skeleton hash)
  ◀── account_behavior_vectors      (1:1 features JSONB, vector(11))
  ◀── forensic_flags.address        (evidence JSONB)
transactions (hash PK, status pending|mined|replaced|dropped)
  ◀── enrichment_jobs.tx_hash       (1:1 outbox row)
  ◀── token_transfers.tx_hash       (PK tx_hash, log_index)
  ◀── forensic_flags.tx_hash        (UNIQUE tx_hash, address, flag_type)
network_hourly (bucket PK)          hourly rollup for the dashboard
VIEW address_risk, FUNCTION address_risk_level(addr)
```

Graph model: `(:Account {address})-[:SENT {hash, value, value_eth, timestamp}]->(:Account)` and `(:Account)-[:TRANSFERRED {tx_hash, log_index, token, amount, timestamp}]->(:Account)`, with a uniqueness constraint on `Account.address`.

Migrations `000007`–`000011` each address one concern and can be explained on their own: indexes and queue, chain data, rollup, vector model v2, risk view and cleanup.

---

## Running it

Requirements: Go 1.26, Node.js with pnpm, Docker.

### Option A: local dev chain (recommended for demos)

A `geth --dev` chain with the same ports as the mainnet stack, plus a generator that produces realistic activity: ETH and token transfers, contract calls, three-hop loops, redeployed scam-contract clones and fee-bumped replacements.

```bash
docker compose -f devnet/docker-compose.yml up -d     # stop ~/ethereum-node first: same ports
go run .                                              # backend on :8080
go run ./cmd/devnet-traffic                           # prints a directory of interesting addresses
cd web && pnpm install && pnpm dev                    # frontend on :3000
```

`docker compose -f devnet/docker-compose.yml down` resets everything.

### Option B: mainnet node

The node and databases are defined in `~/ethereum-node/docker-compose.yml` (geth + Lighthouse, PostgreSQL with pgvector, Neo4j; RPC and database ports bound to 127.0.0.1). The pending-transaction feed only flows once geth is fully synced:

```bash
cd ~/ethereum-node && docker compose up -d
curl -s -X POST localhost:8545 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}'    # "result":false when synced
cd ~/forensic-listener && go run .
```

### Configuration

| Variable | Default |
| --- | --- |
| `POSTGRES_URL` | `postgres://forensic:forensic@localhost:5432/blockchain` |
| `POSTGRES_MIGRATIONS_URL` | `pgx5://forensic:forensic@localhost:5432/blockchain` |
| `NEO4J_URL` / `NEO4J_USER` / `NEO4J_PASSWORD` | `bolt://localhost:7687` / `neo4j` / `forensic123` |
| `ETH_WS_URL` | `ws://localhost:8546` |
| `API_ADDR` | `:8080` |
| `API_AUTH_TOKEN` | empty (no auth) |
| `API_ALLOW_ORIGIN` | `*` |
| `API_RATE_LIMIT_RPM` | `0` (off) |
| `DISABLE_NEO4J=1` | run without graph features |
| `REQUIRE_NEO4J=1` | fail startup if Neo4j is unavailable |
| `DISABLE_BLOCK_INGEST=1` | pending transactions only |
| `NEO4J_REPAIR_ONLY=1` | merge duplicate graph nodes and exit |

Migrations are embedded in the binary and run at startup.

Frontend: `FORENSIC_API_BASE_URL`, `FORENSIC_API_AUTH_TOKEN` (see `web/.env.example`). The browser talks to the API through the Next.js proxy at `/api/forensic/*`, which adds the token server-side. The UI has no user login; run it on a trusted network.

---

## Tests

```bash
go test ./...                                          # unit tests (embedding calibration, scaling)

# integration tests against real stores (e.g. the dev chain stack)
FORENSIC_TEST_POSTGRES_URL=postgres://forensic:forensic@localhost:5432/postgres \
FORENSIC_TEST_NEO4J_URL=bolt://localhost:7687 \
go test ./store -v
```

Integration tests create and drop their own database. They cover: concurrent opposite-direction ingestion without deadlocks or lost rows, the queue never double-claiming a job, exponential backoff and parking of failed jobs, risk precedence, block promotion, replacement detection, token decoding, reorg rollback, zero-filled rollups, clone similarity through HNSW, time-ordered loop detection, and bounded neighbourhood expansion on a hub.

---

## API

| Method and path | Store | Returns |
| --- | --- | --- |
| `GET /health` | all | per-store ping latency and node feed status |
| `GET /stream/events` | PostgreSQL | SSE snapshot every 2 s (counts, queue, lifecycle, latest transactions and flags) |
| `GET /transactions?limit=` | PostgreSQL | latest observed transactions |
| `GET /transactions/{hash}` | PostgreSQL | transaction with calldata, status and receipt fields |
| `GET /transactions/{hash}/flags` | PostgreSQL | flags with evidence and detector explanation |
| `GET /transactions/{hash}/token-transfers` | PostgreSQL | decoded ERC-20 transfers |
| `GET /accounts/{address}/profile` | PostgreSQL + node | counts, risk breakdown, counterparties, flags; live balance |
| `GET /accounts/{address}/behavior` | pgvector | stored behaviour features |
| `GET /accounts/{address}/similar` | pgvector | nearest behaviour neighbours |
| `GET /accounts/{address}/velocity?hours=` | PostgreSQL | zero-filled hourly activity |
| `GET /addresses/top` | PostgreSQL | most active addresses (cached 30 s) |
| `GET /addresses/{address}/graph?depth=&flows=` | Neo4j | bounded neighbourhood (`flows` = all, eth, token) |
| `GET /addresses/{address}/trace?to=&depth=&flows=` | Neo4j | shortest directed path |
| `GET /entities/hubs` | Neo4j | highest-degree accounts (cached 30 s) |
| `POST /entities/{address}` | PostgreSQL + pgvector | save a label; medium or high risk flags clones |
| `GET /contracts/recent` | PostgreSQL | recently active contracts with clone-family size |
| `GET /contracts/{address}` | PostgreSQL | bytecode, skeleton hash, clone family, call count |
| `GET /contracts/{address}/similar` | pgvector | nearest bytecode neighbours |
| `GET /flags`, `GET /forensics/circular` | PostgreSQL | recent flags, circular flows with path evidence |
| `GET /stats/network?hours=`, `GET /stats/flags` | PostgreSQL | hourly rollup, flag series |

Addresses and hashes are validated (400 on malformed input); graph timeouts return 504 so the UI can distinguish "timed out" from "nothing stored".

---

## Limitations

- The system knows only what the connected node has shown it since ingestion started: no historical backfill.
- Token amounts are shown in base units, because decimals are not fetched for arbitrary tokens.
- Detectors produce investigative signals, not proof. Circular flows include legitimate round trips, and similarity reflects code structure, not intent.
- `dropped` is a heuristic (not mined within 3 hours).
