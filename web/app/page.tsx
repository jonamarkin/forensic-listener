import Link from "next/link";
import { Activity, ArrowRight, Binary, Database, Network } from "lucide-react";

import { Button } from "@/components/ui/button";

const STORES = [
  {
    icon: <Database className="size-5" />,
    name: "PostgreSQL",
    role: "System of record",
    tone: "text-[#2c5d88] bg-[#e8f0f8]",
    points: [
      "Transactions, blocks, token transfers and flags with foreign keys",
      "One ACID transaction per ingested transaction, plus its job (transactional outbox)",
      "A queue workers claim concurrently with FOR UPDATE SKIP LOCKED",
    ],
  },
  {
    icon: <Network className="size-5" />,
    name: "Neo4j",
    role: "Value-flow graph",
    tone: "text-[#1b7467] bg-[#e4f3f0]",
    points: [
      "ETH transactions and token transfers as directed edges",
      "Time-ordered loop detection over variable-length paths",
      "Shortest-path tracing that stays fast as hop counts grow",
    ],
  },
  {
    icon: <Binary className="size-5" />,
    name: "pgvector",
    role: "Similarity search",
    tone: "text-[#8a5a12] bg-[#f7eedd]",
    points: [
      "Contract code embeddings that find clones of risky contracts",
      "Behaviour vectors that find accounts acting alike",
      "HNSW indexes, joined with labels in the same SQL query",
    ],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8">
        <section className="overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#17361d_0%,#234c29_60%,#5f8f55_100%)] px-7 py-10 text-white shadow-[0_28px_80px_rgba(18,41,23,0.18)] sm:px-10 lg:py-14">
          <div className="max-w-3xl space-y-5">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
              Forensic Listener
            </span>
            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
              Ethereum forensics on relational, graph and vector data.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/80">
              Transactions from a live Ethereum node are committed to PostgreSQL, projected into a Neo4j flow graph and embedded
              in pgvector. Each store answers the questions it is best at: records and aggregates, multi-hop flows, and similarity.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="!bg-white !text-[#16361b] hover:!bg-[#f3f7ef]">
                <Link href="/overview">
                  Open workspace
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary" className="border-white/25 bg-white/10 text-white hover:bg-white/20">
                <Link href="/system">
                  System status
                  <Activity />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {STORES.map((store) => (
            <article key={store.name} className="rounded-[28px] border border-[#e5e9e1] bg-white/85 p-6 shadow-[0_18px_48px_rgba(18,41,23,0.05)]">
              <div className="flex items-center gap-3">
                <span className={`flex size-11 items-center justify-center rounded-2xl ${store.tone}`}>{store.icon}</span>
                <div>
                  <h2 className="text-lg font-semibold text-[#132118]">{store.name}</h2>
                  <p className="text-sm text-[#6b776d]">{store.role}</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm leading-6 text-[#4d5b50]">
                {store.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#9cbf8f]" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
