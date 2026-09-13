import { ChevronDown } from "lucide-react";

import { SourceTag } from "@/components/dashboard/source-tag";
import type { QuerySnippet } from "@/lib/queries";

/** Collapsible block showing the SQL or Cypher behind a panel. */
export function QueryDisclosure({ query }: { query: QuerySnippet }) {
  return (
    <details className="group mt-4 rounded-2xl border border-[#e3e8e0] bg-[#f7f9f5] text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs font-medium text-[#56645a] transition hover:text-[#1f3a24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2b6631]">
        <span>
          Show query: <span className="text-[#1f2c20]">{query.title}</span>
        </span>
        <span className="flex items-center gap-2">
          <SourceTag engine={query.engine} />
          <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t border-[#e3e8e0] px-4 py-3">
        {query.note ? <p className="mb-2 text-xs leading-5 text-[#5d6a60]">{query.note}</p> : null}
        <pre className="overflow-x-auto font-mono text-[11.5px] leading-5 text-[#26372b]">{query.text.trim()}</pre>
      </div>
    </details>
  );
}
