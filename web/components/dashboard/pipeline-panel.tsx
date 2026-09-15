"use client";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { QueryDisclosure } from "@/components/dashboard/query-disclosure";
import { SourceTag } from "@/components/dashboard/source-tag";
import { QUERIES } from "@/lib/queries";
import { cn, formatExact, formatRelativeTime } from "@/lib/utils";

function Stage({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "neutral" | "busy" | "good" | "bad";
}) {
  return (
    <div className="rounded-[20px] border border-[#ecefe8] bg-white p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a948b]">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "neutral" && "text-[#152319]",
          tone === "busy" && "text-[#8a6732]",
          tone === "good" && "text-[#2b6631]",
          tone === "bad" && "text-[#933f34]",
        )}
      >
        {formatExact(value)}
      </div>
      <div className="mt-1 text-xs text-[#7e887f]">{hint}</div>
    </div>
  );
}

/**
 * The enrichment queue made visible: PostgreSQL commits every transaction with a job
 * row, and workers project it into Neo4j and pgvector afterwards.
 */
export function PipelinePanel({ showQuery = true }: { showQuery?: boolean }) {
  const { snapshot } = useLiveSnapshot();
  const enrichment = snapshot?.enrichment;
  const chain = snapshot?.chain;

  return (
    <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#1a271c]">Enrichment pipeline</h2>
          <p className="mt-1 max-w-xl text-sm text-[#8a948b]">
            Each transaction is committed to PostgreSQL together with a job. Workers then write
            the graph edge to Neo4j, embed contracts in pgvector and run the detectors.
          </p>
        </div>
        <SourceTag engine="postgres" />
      </div>

      {enrichment ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stage
              label="Waiting"
              value={enrichment.pending}
              hint={enrichment.oldest_pending_at ? `oldest ${formatRelativeTime(enrichment.oldest_pending_at)}` : "queue is empty"}
              tone={enrichment.pending > 500 ? "busy" : "neutral"}
            />
            <Stage label="Processing" value={enrichment.processing} hint="leased by a worker" />
            <Stage label="Retrying" value={enrichment.retrying} hint="failed once, backing off" tone={enrichment.retrying ? "busy" : "neutral"} />
            <Stage label="Failed" value={enrichment.failed} hint="gave up after 6 attempts" tone={enrichment.failed ? "bad" : "neutral"} />
            <Stage label="Done" value={enrichment.done} hint="kept for 24 h" tone="good" />
          </div>

          {chain ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[18px] border border-[#ecefe8] bg-[#f6f7f3] px-4 py-3 text-xs text-[#5b685d]">
              <span className="font-medium text-[#1f2c20]">Transaction lifecycle</span>
              <span><b className="tabular-nums text-[#8a6732]">{formatExact(chain.pending)}</b> pending</span>
              <span><b className="tabular-nums text-[#2b6631]">{formatExact(chain.mined)}</b> mined</span>
              <span><b className="tabular-nums text-[#46537d]">{formatExact(chain.replaced)}</b> replaced</span>
              <span><b className="tabular-nums text-[#933f34]">{formatExact(chain.dropped)}</b> dropped</span>
              <span className="text-[#8a948b]">counted {formatRelativeTime(chain.as_of)}</span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
          Waiting for the first live snapshot from the API.
        </div>
      )}

      {showQuery ? <QueryDisclosure query={QUERIES.enrichmentQueue} /> : null}
    </section>
  );
}
