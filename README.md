# Forensic Listener

Forensic Listener is an Ethereum investigation workspace built around three
different database workloads:

- `PostgreSQL` for the relational source of truth
- `Neo4j` for graph traversal and flow tracing
- `pgvector` for similarity search over account behavior and contract bytecode

The application ingests live Ethereum transaction activity, stores the primary
ledger record in PostgreSQL, enriches graph and vector stores asynchronously,
and exposes the results through a Go API and a Next.js frontend.

## What the Project Does

The current application focuses on a small set of investigation surfaces:

- `Overview`: network metrics, recent transactions, and recent forensic flags
- `Account Profile`: lifecycle, counterparties, recent transactions, behavior signature, and velocity snapshot
- `Graph Workspace`: neighborhood expansion, hop-based tracing, hubs, and bounded paths
- `Transaction Detail`: payload, counterparties, and linked forensic flags
- `Contracts`: recent contracts, bytecode fingerprint, metadata, and similar contracts

## Why Multiple Databases Are Used

### PostgreSQL

PostgreSQL is the main transactional store. It holds:

- observed accounts
- transactions
- forensic flags
- known-entity labels
- contract metadata
- enrichment job state
- vector-backed intelligence tables

It is used for the structured parts of the system: integrity constraints,
foreign keys, aggregations, recent activity queries, account profiles, and
transaction detail.

### Neo4j

Neo4j is used for graph-native questions that are awkward in a purely
relational model:

- which addresses are connected
- what is reachable in `n` hops
- what are the highest-degree hubs
- whether circular paths exist

In the graph model:

- nodes are `Account`
- edges are directed `SENT` relationships

### pgvector

`pgvector` is used inside PostgreSQL for nearest-neighbor search:

- contract bytecode similarity
- behavioral similarity between accounts

This keeps similarity search close to the rest of the intelligence layer
without introducing a separate vector service.

## High-Level Architecture

1. Ethereum transactions are read from a WebSocket feed.
2. The Go ingestion layer writes the transaction and related accounts to PostgreSQL.
3. Enrichment workers update Neo4j and pgvector-backed tables.
4. Detection logic raises forensic flags when suspicious patterns are found.
5. The Go API serves relational, graph, and similarity results to the frontend.

## Repository Layout

```text
api/         HTTP routes and API middleware
client/      Ethereum client integration
forensics/   Detection logic
ingestion/   Ingestion engine and worker pipeline
migrations/  PostgreSQL schema migrations
models/      Shared domain models
store/       PostgreSQL, Neo4j, and pgvector persistence logic
web/         Next.js frontend
main.go      Application startup and wiring
```

## Requirements

- Go `1.26.1`
- PostgreSQL with the `vector` extension available
- Neo4j
- An Ethereum node with WebSocket access
- Node.js and `pnpm`

## Backend Configuration

The backend reads these environment variables:

| Variable | Default |
| --- | --- |
| `POSTGRES_URL` | `postgres://forensic:forensic@localhost:5432/blockchain` |
| `POSTGRES_MIGRATIONS_URL` | `pgx5://forensic:forensic@localhost:5432/blockchain` |
| `NEO4J_URL` | `bolt://localhost:7687` |
| `NEO4J_USER` | `neo4j` |
| `NEO4J_PASSWORD` | `forensic123` |
| `ETH_WS_URL` | `ws://localhost:8546` |
| `API_ADDR` | `:8080` |
| `API_AUTH_TOKEN` | empty |
| `API_ALLOW_ORIGIN` | `*` |
| `API_RATE_LIMIT_RPM` | `0` |

Useful optional flags:

- `DISABLE_NEO4J=1` to run without graph features
- `REQUIRE_NEO4J=1` to fail startup if Neo4j is unavailable
- `NEO4J_REPAIR_ONLY=1` to run duplicate-account repair mode

## Frontend Configuration

The frontend uses:

- `FORENSIC_API_BASE_URL`
- `FORENSIC_API_AUTH_TOKEN`
- `NEXT_PUBLIC_API_BASE_URL`

See [web/.env.example](web/.env.example).

## Running Locally

### 1. Start the backend

```bash
/usr/local/go/bin/go run main.go
```

On startup, the backend:

- runs PostgreSQL migrations
- seeds the known-entity reference set
- connects to PostgreSQL, pgvector, Neo4j, and the Ethereum node
- starts the ingestion engine
- starts the HTTP API

### 2. Start the frontend

```bash
cd web
pnpm install
pnpm dev
```

The frontend will be available at `http://localhost:3000`.

## Useful Routes

- `/` landing page
- `/login` login entry page
- `/overview` overview dashboard
- `/accounts/[address]` account profile
- `/transactions/[hash]` transaction detail
- `/graph` graph workspace
- `/contracts` recent contracts
- `/contracts/[address]` contract detail

## Important Notes

- The system only knows the subset of Ethereum activity that has been ingested.
- The `known_entities` table is a small seeded reference layer, not the main dataset.
- PostgreSQL is the durable source of truth; Neo4j and vector-backed intelligence are eventually consistent enrichment layers.
- Forensic flags and similarity scores are investigative signals, not proof.

## Build Checks

Backend:

```bash
/usr/local/go/bin/go build ./...
```

Frontend:

```bash
cd web
pnpm build
```
