import Link from "next/link";
import { AlertTriangle, Fingerprint, ScanSearch } from "lucide-react";

import { QueryDisclosure } from "@/components/dashboard/query-disclosure";
import { SourceTag } from "@/components/dashboard/source-tag";
import { Badge } from "@/components/ui/badge";
import { apiResult } from "@/lib/api";
import { QUERIES } from "@/lib/queries";
import type { ContractSummary } from "@/lib/types";
import { formatAddress, formatExact, formatRelativeTime, riskTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const result = await apiResult<ContractSummary[]>("/contracts/recent?limit=24");
  const contracts = result.data ?? [];
  const analysed = contracts.filter((c) => c.bytecode_size > 0).length;
  const flagged = contracts.filter((c) => c.flagged).length;
  const inFamilies = contracts.filter((c) => c.clone_family_size > 1).length;

  return (
    <div className="space-y-6 pb-10">
      <section>
        <div className="flex items-center gap-2">
          <h1 className="text-[1.6rem] font-semibold tracking-tight text-[#162317] lg:text-[1.85rem]">Contracts</h1>
          <SourceTag engine="postgres" />
          <SourceTag engine="pgvector" />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-[#7b867c]">
          Contracts called or deployed in observed transactions, most recently active first. The first time a contract is seen,
          its bytecode is fetched from the node and embedded in pgvector so clones and close variants can be found.
        </p>
      </section>

      {result.error ? (
        <div role="alert" className="flex items-start gap-3 rounded-[20px] border border-[#ecc5c0] bg-[#fcefed] px-4 py-3 text-sm text-[#7f2f27]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {result.error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Shown", value: contracts.length, detail: "most recently active" },
          { label: "Code analysed", value: analysed, detail: "bytecode stored and embedded" },
          { label: "Flagged", value: flagged, detail: "clone of a risky contract" },
          { label: "In a clone family", value: inFamilies, detail: "share code with another deployment" },
        ].map((item) => (
          <div key={item.label} className="rounded-[22px] border border-[#e8ebe4] bg-[#fdfefb] p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-[#152319]">{formatExact(item.value)}</div>
            <div className="mt-1 text-xs text-[#7b867c]">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
            <ScanSearch className="size-4 text-[#2b6631]" />
            Recently active contracts
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {contracts.length ? (
              contracts.map((contract) => (
                <Link
                  key={contract.address}
                  href={`/contracts/${contract.address}`}
                  className="block rounded-[22px] border border-[#e8ebe4] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#132118]">{contract.entity_name || formatAddress(contract.address, 7)}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[#7e887f]">{formatAddress(contract.address, 6)}</div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {contract.flagged ? <Badge variant="danger">flagged</Badge> : null}
                      {contract.risk_level !== "none" ? <Badge className={riskTone(contract.risk_level)}>{contract.risk_level}</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6f7b72]">
                    <span>{contract.bytecode_size ? `${formatExact(contract.bytecode_size)} bytes` : "code not analysed yet"}</span>
                    {contract.clone_family_size > 1 ? (
                      <span className="flex items-center gap-1 text-[#8a5a12]">
                        <Fingerprint className="size-3" />
                        {contract.clone_family_size} deployments share this code
                      </span>
                    ) : null}
                    <span>active {formatRelativeTime(contract.last_seen)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065] md:col-span-2">
                No contracts observed yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <h2 className="text-base font-semibold text-[#1a271c]">How contract similarity works</h2>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-[#56645a]">
            <li>
              <b className="text-[#1c2a1d]">1. Normalise.</b> The bytecode is read as EVM opcodes; constants inside PUSH instructions and the
              compiler's metadata trailer are dropped.
            </li>
            <li>
              <b className="text-[#1c2a1d]">2. Embed.</b> Opcode pairs and triples are hashed into a 1,024-dimension vector with random signs, so
              unrelated code cancels out (≈0) and shared structure adds up.
            </li>
            <li>
              <b className="text-[#1c2a1d]">3. Compare.</b> pgvector's HNSW index returns the nearest contracts by cosine similarity. At 85% or more
              to a contract labelled risky, a flag is raised.
            </li>
          </ol>
          <QueryDisclosure query={QUERIES.similarContracts} />
        </div>
      </section>
    </div>
  );
}
