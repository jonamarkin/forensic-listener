# forensic-listener

Ethereum forensic monitoring with:

- Go ingestion and API services
- PostgreSQL for the relational and case-management surface
- Neo4j for transaction flow and path tracing
- pgvector for contract and behavior similarity
- a new routed Next.js dashboard in [`web/`](/home/ato/forensic-listener/web)

## Frontend stack

The new web app is scaffolded with the current Next.js App Router and shadcn-style component setup:

- `next@15.5.3`
- `react@19.1.1`
- `shadcn@3.2.1`
- `tailwindcss@4.1.13`

## Run locally

### 1. Start the Go backend

```bash
go run main.go
```

The API listens on `http://localhost:8080` by default.

### 2. Start the new Next.js dashboard

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

### 3. Optional backend auth

If your Go API is protected with `API_AUTH_TOKEN`, set the same token in:

```bash
web/.env.local
```

```env
FORENSIC_API_AUTH_TOKEN=your-token-here
```

The Next app proxies browser-side note/tag writes through its own route handlers, so the browser does not need to know the backend token directly.

## Environment

The Next app reads:

```env
FORENSIC_API_BASE_URL=http://localhost:8080
FORENSIC_API_AUTH_TOKEN=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

`FORENSIC_API_BASE_URL` is the important one for the server-side dashboard fetches and proxy route.

## New dashboard routes

The new dashboard is split into dedicated investigative surfaces:

- `/overview`
- `/graph`
- `/alerts`
- `/accounts/[address]`
- `/contracts/[address]`

This replaces the old “everything on one page” feel with route-specific workflows:

- Overview: pipeline health, throughput, recent activity
- Graph: transaction flow canvas and hub/path tracing
- Alerts: velocity spikes and circular flow review
- Account dossier: notes, tags, behavior, counterparties, velocity
- Contract intelligence: bytecode, artifacts, and similarity

## Live behavior

The new Next dashboard now uses a shared live feed:

- Overview and Alerts hydrate from the backend SSE endpoint at `/stream/events`
- heavier analytics on those pages refresh in the background on a timer
- graph, account, and contract routes remain request-driven on navigation or refresh

That means the monitoring surfaces feel live, while the deeper investigation routes stay cheaper and more focused.

## Internet access

Yes, the dashboard can be exposed over the internet, but the safest setup is:

1. Expose only the Next.js app publicly.
2. Keep the Go API on a private port.
3. Keep PostgreSQL, Neo4j, and the Ethereum node private.
4. Let the Next app talk to the Go API over the private network or same host.

### Good production shape

- public: Next.js app behind HTTPS
- private: Go API on `127.0.0.1:8080`
- private: Postgres, Neo4j, Ethereum websocket

### Example with Caddy

```caddy
forensics.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

In that setup:

- the public browser hits only the Next app
- the Next app uses `FORENSIC_API_BASE_URL=http://127.0.0.1:8080`
- the backend stores stay off the public internet

### Fast demo options

For a quick external demo, tunnel the Next app:

- Cloudflare Tunnel
- Tailscale Funnel
- ngrok

Point the tunnel at:

```text
http://localhost:3000
```

## Notes

- The repository now uses a clean split:
  - Go API in `api/`
  - Next.js dashboard in `web/`
- If you want a production deployment next, the cleanest path is:
  - run Go API as one service
  - run Next.js as one service
  - put Caddy or Nginx in front of the Next app
