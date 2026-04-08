import Link from "next/link";
import {
  ArrowRight,
  Binary,
  Fingerprint,
  Network,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { maybeApiFetch } from "@/lib/api";
import type { ContractDetail, ContractSimilarity } from "@/lib/types";
import {
  entityTone,
  formatAddress,
  formatCount,
  formatDateTime,
  formatSimilarity,
  riskTone,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{
  address: string;
}>;

function prettyJson(value: unknown) {
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ContractMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="bg-white/82 shadow-none">
      <CardContent className="pt-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
          {label}
        </div>
        <div className="mt-3 text-2xl font-semibold text-[#132118]">{value}</div>
        <div className="mt-2 text-sm text-[#6c786d]">{detail}</div>
      </CardContent>
    </Card>
  );
}

export default async function ContractPage({
  params,
}: {
  params: RouteParams;
}) {
  const { address } = await params;
  const [detail, similar] = await Promise.all([
    maybeApiFetch<ContractDetail>(`/contracts/${encodeURIComponent(address)}`),
    maybeApiFetch<ContractSimilarity[]>(
      `/contracts/${encodeURIComponent(address)}/similar?limit=8`,
    ),
  ]);

  if (!detail) {
    return (
      <div className="space-y-6 pb-10">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
              Contract Intelligence
            </p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                Contract not found.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[#59675d]">
                The requested contract is not available from the forensic backend
                right now.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href="/contracts">
              Back to contracts
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
            Contract Intelligence
          </p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className={entityTone(detail.entity_type || "contract")}>
                {detail.entity_type || "contract"}
              </Badge>
              <Badge className={riskTone(detail.risk_level)}>
                {detail.risk_level || "observed"}
              </Badge>
              <Badge
                className={
                  detail.flagged
                    ? "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]"
                    : "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]"
                }
              >
                {detail.flagged ? "flagged" : "observed"}
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                {detail.entity_name || formatAddress(detail.address, 10)}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[#59675d]">
                Contract-focused view for bytecode, verification posture, source
                artifacts, and nearest-neighbor similarity from pgvector.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#dbe3d8] bg-white/78 px-4 py-3">
              <div className="font-mono text-sm text-[#2a382f] [overflow-wrap:anywhere]">
                {detail.address}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/accounts/${encodeURIComponent(detail.address)}`}>
              Open account dossier
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/graph?address=${encodeURIComponent(detail.address)}&depth=2`}>
              Trace contract flow
              <Network className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ContractMetric
          label="Bytecode size"
          value={formatCount(detail.bytecode_size)}
          detail="Stored low-level bytecode length"
        />
        <ContractMetric
          label="Verified"
          value={detail.verified ? "Yes" : "No"}
          detail={
            detail.compiler_version
              ? `Compiler ${detail.compiler_version}`
              : "Compiler unknown"
          }
        />
        <ContractMetric
          label="Similar matches"
          value={formatCount((similar || []).length)}
          detail="Nearest bytecode neighbors from pgvector"
        />
        <ContractMetric
          label="Observed"
          value={formatDateTime(detail.last_seen)}
          detail={`First seen ${formatDateTime(detail.first_seen)}`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <ShieldAlert className="size-5" />
                <CardTitle className="text-[#132118]">Contract brief</CardTitle>
              </div>
              <CardDescription>
                Core contract context.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="text-sm font-semibold text-[#132118]">Lifecycle</div>
                <div className="mt-3 space-y-2 text-sm text-[#556357]">
                  <div>First seen: {formatDateTime(detail.first_seen)}</div>
                  <div>Last seen: {formatDateTime(detail.last_seen)}</div>
                  <div>Address: {detail.address}</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4">
                <div className="text-sm font-semibold text-[#132118]">
                  Intelligence context
                </div>
                <div className="mt-3 space-y-2 text-sm text-[#556357]">
                  <div>Entity name: {detail.entity_name || "Unlabeled"}</div>
                  <div>Risk level: {detail.risk_level || "Unknown"}</div>
                  <div>Source artifacts: {detail.source_code ? "available" : "missing"}</div>
                  <div>Decompiler output: {detail.decompiled_code ? "available" : "missing"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <details
            open
            className="overflow-hidden rounded-[30px] border border-[#dbe3d8] bg-white/82"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-[#132118]">
                  Bytecode fingerprint
                </div>
                <div className="mt-1 text-sm text-[#617065]">
                  Raw bytecode.
                </div>
              </div>
              <Binary className="size-4 text-[#2b6631]" />
            </summary>
            <div className="border-t border-[#e2e8dd] p-4">
              <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
                {detail.bytecode || "No bytecode stored."}
              </pre>
            </div>
          </details>

          {detail.source_code ? (
            <details className="overflow-hidden rounded-[30px] border border-[#dbe3d8] bg-white/82">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-[#132118]">Source code</div>
                  <div className="mt-1 text-sm text-[#617065]">
                    Verified implementation.
                  </div>
                </div>
                <span className="rounded-full border border-[#d7e2d0] bg-[#f7faf4] px-3 py-1 text-xs font-medium text-[#2b6631]">
                  Expand
                </span>
              </summary>
              <div className="border-t border-[#e2e8dd] p-4">
                <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
                  {detail.source_code}
                </pre>
              </div>
            </details>
          ) : null}

          {detail.decompiled_code ? (
            <details className="overflow-hidden rounded-[30px] border border-[#dbe3d8] bg-white/82">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-[#132118]">
                    Decompiled view
                  </div>
                  <div className="mt-1 text-sm text-[#617065]">
                    Recovered logic view.
                  </div>
                </div>
                <span className="rounded-full border border-[#d7e2d0] bg-[#f7faf4] px-3 py-1 text-xs font-medium text-[#2b6631]">
                  Expand
                </span>
              </summary>
              <div className="border-t border-[#e2e8dd] p-4">
                <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
                  {detail.decompiled_code}
                </pre>
              </div>
            </details>
          ) : null}

          {detail.abi ? (
            <details className="overflow-hidden rounded-[30px] border border-[#dbe3d8] bg-white/82">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-[#132118]">ABI</div>
                  <div className="mt-1 text-sm text-[#617065]">
                    Contract interface.
                  </div>
                </div>
                <span className="rounded-full border border-[#d7e2d0] bg-[#f7faf4] px-3 py-1 text-xs font-medium text-[#2b6631]">
                  Expand
                </span>
              </summary>
              <div className="border-t border-[#e2e8dd] p-4">
                <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
                  {prettyJson(detail.abi)}
                </pre>
              </div>
            </details>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Fingerprint className="size-5" />
                <CardTitle className="text-[#132118]">Similar contracts</CardTitle>
              </div>
              <CardDescription>
                Nearest bytecode neighbors to help spot clones, kits, or deployment
                families.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(similar || []).length ? (
                similar!.slice(0, 4).map((match) => (
                  <Link
                    key={match.address}
                    href={`/contracts/${encodeURIComponent(match.address)}`}
                    className="block rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#132118]">
                          {formatAddress(match.address, 8)}
                        </div>
                        <div className="mt-1 text-sm text-[#5d6a60]">
                          Similarity {formatSimilarity(match.similarity)}
                        </div>
                      </div>
                      <Badge
                        className={
                          match.flagged
                            ? "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]"
                            : "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]"
                        }
                      >
                        {match.flagged ? "flagged" : "observed"}
                      </Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                  No similar contracts were returned for this bytecode yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[#132118]">Review priorities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#556357]">
              <p>Check similar contracts first if you suspect cloning or templated deployment.</p>
              <p>Use the account dossier and graph view when value movement matters.</p>
              <p>Bytecode is primary evidence. Source, decompilation, and ABI are supporting context.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
