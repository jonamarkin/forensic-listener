import type { Engine } from "@/components/dashboard/source-tag";

// Shared by server and client components (constants must not live in "use client" modules).

export const FLAG_LABELS: Record<string, string> = {
  circular_flow: "Circular flow",
  similar_bytecode: "Clone of a risky contract",
};

/** The store whose query produced each kind of flag (all flags are stored in PostgreSQL). */
export const FLAG_ENGINES: Record<string, Engine[]> = {
  circular_flow: ["neo4j"],
  similar_bytecode: ["pgvector"],
};
