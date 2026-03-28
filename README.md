# Forensic Listener

## Database Systems Project

Forensic Listener is an Ethereum monitoring and investigation system built as a
database-centric application. It ingests live Ethereum transaction activity,
stores it in multiple specialized data models, and exposes the results through a
Go API and a routed Next.js dashboard.

The core idea of the project is that a single database model is not enough for
all forensic workloads:

- a relational database is best for ledger data, integrity, and case records
- a graph database is best for multi-hop transaction tracing
- a vector database extension is best for similarity search over contracts and
  account behavior

The dashboard exists to demonstrate those database capabilities. The primary
academic focus of the project is the storage design, schema design, indexing,
constraints, and query model.

## Project Objective

This project answers a practical database question:

> How should an Ethereum forensic system model data when the application needs
> structured ledger queries, graph traversals, and similarity search at the
> same time?

To answer that, the system uses a polyglot persistence design:

- PostgreSQL for the relational source of truth
- Neo4j for flow tracing and circular-path analysis
- pgvector inside PostgreSQL for similarity search

## Why This Is a Database Project

The most important work in this repository is not UI styling; it is the design
of the underlying data layer:

- normalized relational schema with primary keys and foreign keys
- integrity constraints and uniqueness rules
- indexes for common forensic queries
- queue modeling for enrichment jobs
- graph modeling for address-to-address traversal
- vector modeling for approximate similarity
- controlled use of semi-structured data with `JSONB`

In other words, this is a database systems project presented through a forensic
application domain.

## Database Architecture

| Store | Role in the system | Why it is used |
| --- | --- | --- |
| PostgreSQL | Main transactional store | Best fit for accounts, transactions, flags, notes, tags, and metadata with integrity guarantees |
| Neo4j | Transaction-flow graph | Best fit for path queries, hub discovery, and circular flow detection |
| pgvector | Similarity search inside PostgreSQL | Best fit for contract bytecode similarity and behavioral nearest-neighbor search |

This design was chosen deliberately so that each database technology is used for
the query pattern it handles best.

## Relational Schema (PostgreSQL)

The PostgreSQL schema is evolved through SQL migrations in [`migrations/`](migrations).

### Core ledger tables

- `accounts`
  - one row per Ethereum address
  - primary key: `address`
  - stores balance, contract flag, and first/last seen timestamps
- `transactions`
  - one row per observed Ethereum transaction
  - primary key: `hash`
  - foreign keys:
    - `from_address -> accounts(address)`
    - `to_address -> accounts(address)`
  - stores value, gas, gas price, nonce, block number, calldata, and timestamp
- `forensic_flags`
  - stores anomalies and findings raised by the forensic logic
  - links findings back to transactions and/or accounts

### Workflow / enrichment tables

- `enrichment_jobs`
  - models asynchronous enrichment work as database state
  - stores status, retry count, lock information, and next availability
  - demonstrates queue-like processing inside a relational system

### Intelligence / case-management tables

- `known_entities`
  - curated labels for addresses such as exchange, stablecoin, hub, or mixer
- `investigator_notes`
  - free-text analyst notes attached to an address
- `address_tags`
  - normalized address-tag pairs with uniqueness enforcement
- `contract_metadata`
  - stores ABI, source code, decompiled code, compiler version, and verification
  - uses `JSONB` for ABI because ABI structure is semi-structured but still
    naturally attached to a relational entity

### Vector-backed tables stored in PostgreSQL

- `contract_vectors`
  - bytecode and a `vector(128)` embedding for contract similarity
- `account_behavior_vectors`
  - a `vector(128)` embedding plus `features JSONB` for behavioral similarity

## Relational Integrity and Indexing

The schema demonstrates several important database design principles:

- primary keys on business identifiers:
  - `accounts.address`
  - `transactions.hash`
- foreign-key relationships from transactions, notes, tags, and metadata back
  to `accounts`
- domain constraints:
  - `forensic_flags.severity IN ('low', 'medium', 'high')`
  - `known_entities.risk_level IN ('none', 'low', 'medium', 'high')`
- deduplication constraints:
  - unique forensic signal index on `(tx_hash, address, flag_type)`
  - unique tag constraint on `(address, tag)`
- targeted indexes for expected access patterns:
  - `transactions(from_address)`
  - `transactions(to_address)`
  - `transactions(block_number)`
  - `forensic_flags(address)`
  - `known_entities(entity_type, is_hub, risk_level)`
  - descending indexes for notes/tags recency

These choices are central to the project because the application must support
both ingestion and investigation efficiently.

## Graph Model (Neo4j)

Neo4j is used for the part of the workload that SQL handles poorly: multi-hop
transaction tracing.

### Graph representation

- nodes: `Account`
- node key property: `address`
- relationships: directed transfer edges between accounts

### Why Neo4j is necessary

Neo4j is used for:

- expanding the neighborhood of an address
- tracing funds multiple hops outward
- finding return paths
- detecting circular flows
- identifying high-degree hubs

These are graph problems, not simple relational lookups. The project therefore
uses a graph database where graph queries are a first-class operation.

### Graph integrity

The implementation also enforces uniqueness of account nodes by address and
contains duplicate-repair logic so that graph traversals operate on a clean
entity model.

## Vector Search (pgvector)

The project uses the `vector` PostgreSQL extension to add similarity search
without introducing a separate vector service.

### Two vector use cases are implemented

1. Contract bytecode similarity
   - stored in `contract_vectors`
   - used to find contracts with similar deployed bytecode

2. Behavioral account similarity
   - stored in `account_behavior_vectors`
   - used to compare accounts by activity pattern rather than exact address

### Why pgvector was chosen

- keeps vector search inside the same transactional database used for the rest
  of the structured intelligence layer
- simplifies deployment
- makes it easy to join similarity results back to relational metadata

## Why There Is No MongoDB

MongoDB was intentionally not added.

The project still supports semi-structured data, but it does so selectively:

- `contract_metadata.abi` uses `JSONB`
- `account_behavior_vectors.features` uses `JSONB`

That design keeps the architecture simpler while still supporting variable
document-like structures. For this project, PostgreSQL plus `JSONB` is enough,
so a fourth datastore would add operational complexity without adding meaningful
academic value.

## Representative Database Operations

This system demonstrates different classes of database operations:

### PostgreSQL

- recent transaction ledger queries
- top active addresses
- account dossier aggregation
- case notes and tags
- enrichment queue management
- alert and metrics retrieval

### Neo4j

- graph neighborhood expansion
- transaction trace paths
- circular flow detection
- hub discovery

### pgvector

- nearest-neighbor contract similarity
- nearest-neighbor behavioral similarity between accounts

## Application Features That Demonstrate the Databases

The frontend is organized to expose the database capabilities clearly:

- `/overview`
  - relational summaries, metrics, enrichment state, recent activity
- `/graph`
  - graph traversal, path tracing, hub analysis
- `/alerts`
  - forensic flags, velocity spikes, circular flow review
- `/accounts/[address]`
  - dossier view with relational aggregates, notes, tags, behavior profile
- `/contracts/[address]`
  - contract metadata and vector similarity

The dashboard is therefore a visualization layer over the underlying database
operations rather than the main focus of the project itself.

## Technology Stack

### Backend

- Go `1.26.1`
- Chi router for the API
- PostgreSQL via `pgx`
- Neo4j Go driver
- `golang-migrate` for schema migrations

### Frontend

- Next.js `15.5.3`
- React `19.1.1`
- shadcn-style component setup
- Tailwind CSS `4`

## Running the Project Locally

### Prerequisites

- Go `1.26.1`
- Node.js with `pnpm`
- PostgreSQL with the `vector` extension enabled
- Neo4j
- an Ethereum websocket endpoint

### Default local configuration

The application defaults are:

- PostgreSQL:
  - `postgres://forensic:forensic@localhost:5432/blockchain`
- PostgreSQL migrations:
  - `pgx5://forensic:forensic@localhost:5432/blockchain`
- Neo4j:
  - `bolt://localhost:7687`
  - user: `neo4j`
  - password: `forensic123`
- Ethereum websocket:
  - `ws://localhost:8546`
- Go API:
  - `:8080`
- Next.js dashboard:
  - `:3000`

### Start the backend

```bash
go run main.go
```

This runs migrations automatically, connects PostgreSQL, pgvector, Neo4j, and
the Ethereum websocket, and then starts the API.

### Start the frontend

```bash
cd web
cp .env.example .env.local
pnpm install
pnpm dev
```

Then open:

```text
http://localhost:3000
```

The root page redirects to `/overview`.

### Optional frontend environment

The Next.js frontend reads:

```env
FORENSIC_API_BASE_URL=http://localhost:8080
FORENSIC_API_AUTH_TOKEN=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

If backend auth is enabled with `API_AUTH_TOKEN`, set the matching token in
`web/.env.local` as `FORENSIC_API_AUTH_TOKEN`.

## Repository Structure

- `main.go`
  - application entrypoint
- `migrations/`
  - relational schema evolution
- `store/`
  - PostgreSQL, Neo4j, and pgvector data-access logic
- `forensics/`
  - anomaly and circular-flow detection logic
- `api/`
  - Go API
- `web/`
  - Next.js dashboard

## Database Concepts Demonstrated

From a database-systems perspective, this project demonstrates:

- schema design
- normalization
- key and foreign-key enforcement
- constraint design
- indexing strategy
- semi-structured storage with `JSONB`
- queue/state modeling inside SQL
- graph modeling and traversal
- vector similarity search
- multi-model data architecture
- migration-driven schema evolution

## Limitations and Future Work

If this project were extended further, the next database-focused improvements
would be:

- partitioning very large transaction tables by block or time
- adding benchmark results for common queries
- broadening the curated entity catalog
- extending graph labels and relationship types beyond raw transfers
- improving similarity feature engineering for account behavior

## Conclusion

Forensic Listener is best understood as a database architecture project applied
to blockchain forensics.

Its main contribution is not simply “an Ethereum dashboard,” but a working
example of how relational, graph, and vector data models can coexist in one
system, with each chosen because it is the right model for a different class of
queries.
