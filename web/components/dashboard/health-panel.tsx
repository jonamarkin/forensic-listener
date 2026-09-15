"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Radio, XCircle } from "lucide-react";

import { clientApiFetch } from "@/lib/client-api";
import type { Health } from "@/lib/types";
import { cn, formatExact, formatRelativeTime } from "@/lib/utils";

const DISPLAY_NAMES: Record<string, string> = {
  postgresql: "PostgreSQL",
  pgvector: "pgvector",
  neo4j: "Neo4j",
  "ethereum node": "Ethereum node",
};

const ROLES: Record<string, string> = {
  postgresql: "System of record: ledger, queue, labels, flags",
  pgvector: "Similarity search inside PostgreSQL",
  neo4j: "Value-flow graph for traversal",
  "ethereum node": "Source of pending transactions, blocks, receipts, balances",
};

export function HealthPanel({ initial, initialError }: { initial: Health | null; initialError: string | null }) {
  const [health, setHealth] = useState(initial);
  const [error, setError] = useState(initialError);
  const [checkedAt, setCheckedAt] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        setHealth(await clientApiFetch<Health>("/health"));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Health check failed.");
      }
      setCheckedAt(new Date());
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const ingestion = health?.ingestion;

  return (
    <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#1a271c]">Stores and node</h2>
          <p className="mt-1 text-sm text-[#7b867c]">Each dependency is pinged by the API; checked every 10 seconds (last {formatRelativeTime(checkedAt)}).</p>
        </div>
        {health ? (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
              health.status === "ok" && "border-[#bed7b6] bg-[#e0edd8] text-[#2b6631]",
              health.status === "degraded" && "border-[#e6d3a2] bg-[#f4ead0] text-[#8a6732]",
              health.status === "down" && "border-[#e9b8b3] bg-[#f5d9d7] text-[#933f34]",
            )}
          >
            {health.status}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-[16px] border border-[#ecc5c0] bg-[#fcefed] px-4 py-3 text-sm text-[#7f2f27]">
          {error}
        </p>
      ) : null}

      {health ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {health.stores.map((store) => (
              <div key={store.name} className="flex items-start justify-between gap-3 rounded-[20px] border border-[#ecefe8] bg-white p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1c2a1d]">
                    {store.ok ? <CheckCircle2 className="size-4 text-[#2b6631]" /> : <XCircle className="size-4 text-[#933f34]" />}
                    {DISPLAY_NAMES[store.name] ?? store.name}
                  </div>
                  <div className="mt-1 text-xs text-[#6f7b72]">{ROLES[store.name] ?? ""}</div>
                  {store.error ? <div className="mt-1 text-xs text-[#933f34] [overflow-wrap:anywhere]">{store.error}</div> : null}
                </div>
                <div className="text-right text-xs tabular-nums text-[#6f7b72]">{store.ok ? `${store.latency_ms.toFixed(1)} ms` : "unreachable"}</div>
              </div>
            ))}
          </div>

          {ingestion ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                {
                  label: "Pending-transaction feed",
                  connected: ingestion.pending_feed_connected,
                  detail: `last transaction ${formatRelativeTime(ingestion.last_pending_at)}`,
                },
                {
                  label: "Block feed",
                  connected: ingestion.head_feed_connected,
                  detail: ingestion.last_block ? `block ${formatExact(ingestion.last_block)}, ${formatRelativeTime(ingestion.last_head_at)}` : "no block received yet",
                },
              ].map((feed) => (
                <div key={feed.label} className="flex items-center justify-between gap-3 rounded-[20px] border border-[#ecefe8] bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1c2a1d]">
                    <Radio className={cn("size-4", feed.connected ? "text-[#2b6631]" : "text-[#933f34]")} />
                    {feed.label}
                  </div>
                  <div className="text-right text-xs text-[#6f7b72]">
                    {feed.connected ? "subscribed" : "disconnected, retrying"}
                    <div>{feed.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
