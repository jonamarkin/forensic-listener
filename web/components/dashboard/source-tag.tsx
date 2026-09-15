import { cn } from "@/lib/utils";

const ENGINES = {
  postgres: {
    label: "PostgreSQL",
    className: "border-[#bcd0e4] bg-[#e8f0f8] text-[#2c5d88]",
  },
  neo4j: {
    label: "Neo4j",
    className: "border-[#b8dcd5] bg-[#e4f3f0] text-[#1b7467]",
  },
  pgvector: {
    label: "pgvector",
    className: "border-[#e5d2ae] bg-[#f7eedd] text-[#8a5a12]",
  },
  node: {
    label: "Ethereum node",
    className: "border-[#d7d3e8] bg-[#efedf7] text-[#4f4a7a]",
  },
} as const;

export type Engine = keyof typeof ENGINES;

/** Marks which data store produced the figures in a panel. */
export function SourceTag({ engine, className }: { engine: Engine; className?: string }) {
  const meta = ENGINES[engine];
  return (
    <span
      title={`Served by ${meta.label}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        meta.className,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function SourceTags({ engines, className }: { engines: Engine[]; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {engines.map((engine) => (
        <SourceTag key={engine} engine={engine} />
      ))}
    </span>
  );
}
