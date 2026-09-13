import Link from "next/link";
import { ArrowRight, Binary, Fingerprint, Network, Tag } from "lucide-react";

import { LabelForm } from "@/components/dashboard/label-form";
import { QueryDisclosure } from "@/components/dashboard/query-disclosure";
import { SourceTag } from "@/components/dashboard/source-tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiResult } from "@/lib/api";
import { QUERIES } from "@/lib/queries";
import type { AccountProfile, ContractDetail, ContractSimilarity } from "@/lib/types";
import { entityTone, formatAddress, formatDateTime, formatExact, formatRelativeTime, formatSimilarity, riskTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ address: string }>;

const THRESHOLD = 0.85;

export default async function ContractPage({ params }: { params: RouteParams }) {
  const { address } = await params;
  const [detailResult, similarResult, profileResult] = await Promise.all([
    apiResult<ContractDetail>(`/contracts/${encodeURIComponent(address)}`),
    apiResult<ContractSimilarity[]>(`/contracts/${encodeURIComponent(address)}/similar?limit=8`),
    apiResult<AccountProfile>(`/accounts/${encodeURIComponent(address)}/profile`),
  ]);

  const detail = detailResult.data;
  if (!detail) {
    const title = detailResult.status === 400 ? "That is not a valid address." : detailResult.status === 404 ? "No contract is recorded at this address." : "The contract could not be loaded.";
    return (
      <div className="space-y-4 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-[#132118]">{title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[#59675d]">
          {detailResult.status === 404 ? "It may be a wallet, or a contract that has not been called in observed transactions." : detailResult.error}
        </p>
        <Button asChild variant="secondary">
          <Link href={`/accounts/${address}`}>Open as an account</Link>
        </Button>
      </div>
    );
  }

  const similar = similarResult.data ?? [];
  const profile = profileResult.data;

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge className={entityTone(detail.entity_type)}>{detail.entity_type}</Badge>
            <Badge className={riskTone(detail.risk_level)}>{detail.risk_level === "none" ? "no risk signals" : `${detail.risk_level} risk`}</Badge>
            {detail.flagged ? <Badge variant="danger">flagged clone</Badge> : null}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#132118] sm:text-4xl">{detail.entity_name || `Contract ${formatAddress(detail.address, 6)}`}</h1>
          <p className="font-mono text-sm text-[#2a382f] [overflow-wrap:anywhere]">{detail.address}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/accounts/${detail.address}`}>
              Account view
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/graph?address=${detail.address}&depth=1`}>
              Flows in graph
              <Network />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Bytecode", value: detail.bytecode_size ? `${formatExact(detail.bytecode_size)} bytes` : "Not analysed", detail: detail.embedded_at ? `embedded ${formatRelativeTime(detail.embedded_at)}` : "fetched on first call" },
          { label: "Clone family", value: formatExact(detail.clone_family_size), detail: "deployments with identical code structure" },
          { label: "Calls observed", value: formatExact(detail.transaction_count), detail: "transactions sent to this contract" },
          { label: "Last active", value: formatRelativeTime(detail.last_seen), detail: `first seen ${formatDateTime(detail.first_seen)}` },
        ].map((item) => (
          <div key={item.label} className="rounded-[22px] border border-[#e8ebe4] bg-[#fdfefb] p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-[#152319]">{item.value}</div>
            <div className="mt-1 text-xs text-[#7b867c]">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
                <Fingerprint className="size-4 text-[#8a5a12]" />
                Most similar contracts
              </h2>
              <SourceTag engine="pgvector" />
            </div>
            <p className="mt-1 text-sm text-[#7b867c]">
              Nearest bytecode embeddings. Scores of {formatSimilarity(THRESHOLD)} or more mean the same code family.
            </p>
            <div className="mt-4 space-y-2">
              {similar.length ? (
                similar.map((match) => (
                  <Link key={match.address} href={`/contracts/${match.address}`} className="block rounded-[18px] border border-[#ecefe8] bg-white px-4 py-3 transition hover:border-[#b4cda8]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-[#1c2a1d]">{match.entity_name || formatAddress(match.address, 7)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {match.same_skeleton ? <Badge variant="warning">identical code</Badge> : null}
                        {match.flagged ? <Badge variant="danger">flagged</Badge> : null}
                        {match.risk_level !== "none" ? <Badge className={riskTone(match.risk_level)}>{match.risk_level}</Badge> : null}
                        <span className="w-14 text-right text-sm font-semibold tabular-nums">{formatSimilarity(match.similarity)}</span>
                      </span>
                    </div>
                    <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf1e8]">
                      <div className={`h-full rounded-full ${match.similarity >= THRESHOLD ? "bg-[#8a5a12]" : "bg-[#c9b48f]"}`} style={{ width: `${Math.round(match.similarity * 100)}%` }} />
                      <div className="absolute inset-y-0 w-px bg-[#5d4a2a]" style={{ left: `${THRESHOLD * 100}%` }} title="flag threshold" />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-5 text-sm text-[#627065]">
                  {detail.bytecode_size ? "No other contracts have been embedded yet." : "Similarity is available once this contract's code has been analysed."}
                </div>
              )}
            </div>
            <QueryDisclosure query={QUERIES.similarContracts} />
          </section>

          <details className="overflow-hidden rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <span className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
                <Binary className="size-4 text-[#2b6631]" />
                Runtime bytecode
              </span>
              <span className="text-xs text-[#7e887f]">{formatExact(detail.bytecode_size)} bytes · expand</span>
            </summary>
            <div className="space-y-3 border-t border-[#e2e8dd] p-5">
              <div className="text-xs text-[#6f7b72]">
                Opcode skeleton hash: <span className="font-mono text-[#1c2a1d] [overflow-wrap:anywhere]">{detail.skeleton_hash || "not computed"}</span>
              </div>
              <pre className="max-h-[320px] overflow-auto rounded-[18px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 font-mono text-[11px] leading-5 text-[#314137] whitespace-pre-wrap [overflow-wrap:anywhere]">
                {detail.bytecode === "0x" ? "No bytecode stored." : detail.bytecode}
              </pre>
            </div>
          </details>
        </div>

        <section className="h-fit rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
              <Tag className="size-4 text-[#2b6631]" />
              Label this contract
            </h2>
            <SourceTag engine="postgres" />
          </div>
          <p className="mt-1 mb-4 text-sm leading-6 text-[#7b867c]">
            Labelling a contract medium or high risk immediately flags stored contracts whose code is at least {formatSimilarity(THRESHOLD)} similar, and
            every future deployment of the same code.
          </p>
          <LabelForm
            address={detail.address}
            isContract
            initial={{
              name: profile?.entity_name ?? detail.entity_name,
              entity_type: profile?.label_source ? detail.entity_type : "scam",
              risk_level: profile?.label_source ? (profile?.label_risk ?? "none") : "high",
              source: profile?.label_source ?? "",
            }}
          />
        </section>
      </section>
    </div>
  );
}
