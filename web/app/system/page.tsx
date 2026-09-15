import { HealthPanel } from "@/components/dashboard/health-panel";
import { PipelinePanel } from "@/components/dashboard/pipeline-panel";
import { type Engine, SourceTag } from "@/components/dashboard/source-tag";
import { apiResult } from "@/lib/api";
import type { Health } from "@/lib/types";

export const dynamic = "force-dynamic";

const STEPS: { engine: Engine; title: string; text: string }[] = [
  {
    engine: "node",
    title: "Observe",
    text: "The Go backend subscribes to the node's pending transactions and new block headers over WebSocket, and reconnects automatically if either feed drops.",
  },
  {
    engine: "postgres",
    title: "Commit",
    text: "Each pending transaction is stored with its accounts and an enrichment job in one ACID transaction. Each block promotes transactions to mined, detects replacements and decodes token transfers.",
  },
  {
    engine: "neo4j",
    title: "Project",
    text: "Enrichment workers claim jobs with SKIP LOCKED and MERGE each transfer into the graph. Writes are idempotent, so retries never duplicate edges.",
  },
  {
    engine: "pgvector",
    title: "Embed",
    text: "New contracts are fetched once and embedded by opcode structure; every 30 seconds, behaviour vectors are rebuilt for recently active accounts.",
  },
  {
    engine: "neo4j",
    title: "Detect",
    text: "Detectors look for time-ordered loops in the graph and for clones of risky contracts in vector space, and record flags with structured JSON evidence.",
  },
];

export default async function SystemPage() {
  const health = await apiResult<Health>("/health");

  return (
    <div className="space-y-6 pb-10">
      <section>
        <h1 className="text-[1.6rem] font-semibold tracking-tight text-[#162317] lg:text-[1.85rem]">System status</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#7b867c]">
          PostgreSQL is the source of truth; Neo4j and the vector tables are projections kept eventually consistent by the
          enrichment queue. If Neo4j is down, ingestion continues and the queue catches up when it returns.
        </p>
      </section>

      <HealthPanel initial={health.data} initialError={health.error} />
      <PipelinePanel />

      <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
        <h2 className="text-base font-semibold text-[#1a271c]">What happens to one transaction</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-[20px] border border-[#ecefe8] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#1c2a1d]">
                  {index + 1}. {step.title}
                </span>
                <SourceTag engine={step.engine} />
              </div>
              <p className="mt-2 text-sm leading-6 text-[#5d6a60]">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
