import Link from "next/link";
import { ArrowRight, Binary, Fingerprint, Network, ShieldAlert } from "lucide-react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { maybeApiFetch } from "@/lib/api";
import type { ContractDetail, ContractSimilarity } from "@/lib/types";
import {
  entityTone,
  formatAddress,
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
        <PageHeading
          eyebrow="Contract Intelligence"
          title="Contract not found."
          description="The requested contract is not available from the forensic backend right now."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Contract Intelligence"
        title={detail.entity_name || formatAddress(detail.address, 10)}
        description="Contract-focused view for bytecode, verification posture, source artifacts, and nearest-neighbor similarity from pgvector."
        actions={
          <>
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
          </>
        }
      />

      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={entityTone(detail.entity_type || "contract")}>
                {detail.entity_type || "contract"}
              </Badge>
              <Badge className={riskTone(detail.risk_level)}>
                {detail.risk_level || "observed"}
              </Badge>
              <Badge variant={detail.flagged ? "danger" : "outline"}>
                {detail.flagged ? "flagged" : "unflagged"}
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/76">
                  Bytecode size
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {detail.bytecode_size.toLocaleString()}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/76">
                  Verified
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {detail.verified ? "Yes" : "No"}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/76">
                  Compiler
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {detail.compiler_version || "Unknown"}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="text-sm font-semibold text-white">Lifecycle</div>
                <div className="mt-3 space-y-2 text-sm text-slate-300/78">
                  <div>First seen: {formatDateTime(detail.first_seen)}</div>
                  <div>Last seen: {formatDateTime(detail.last_seen)}</div>
                  <div>Address: {detail.address}</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="text-sm font-semibold text-white">Intelligence context</div>
                <div className="mt-3 space-y-2 text-sm text-slate-300/78">
                  <div>Entity name: {detail.entity_name || "Unlabeled"}</div>
                  <div>Risk level: {detail.risk_level || "Unknown"}</div>
                  <div>Source artifacts: {detail.source_code ? "available" : "missing"}</div>
                </div>
              </div>
            </div>

            <Card className="border-white/6 bg-black/20 shadow-none">
              <CardHeader>
                <div className="flex items-center gap-2 text-cyan-100">
                  <Binary className="size-5" />
                  <CardTitle className="text-white">Bytecode</CardTitle>
                </div>
                <CardDescription>
                  Use this as the low-level fingerprint when source code is not available.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-white/8 bg-slate-950/80 p-4 text-xs leading-6 text-slate-200">
                  {detail.bytecode || "No bytecode stored."}
                </pre>
              </CardContent>
            </Card>

            {detail.source_code ? (
              <Card className="border-white/6 bg-black/20 shadow-none">
                <CardHeader>
                  <CardTitle className="text-white">Source code</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-white/8 bg-slate-950/80 p-4 text-xs leading-6 text-slate-200">
                    {detail.source_code}
                  </pre>
                </CardContent>
              </Card>
            ) : null}

            {detail.decompiled_code ? (
              <Card className="border-white/6 bg-black/20 shadow-none">
                <CardHeader>
                  <CardTitle className="text-white">Decompiled view</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-white/8 bg-slate-950/80 p-4 text-xs leading-6 text-slate-200">
                    {detail.decompiled_code}
                  </pre>
                </CardContent>
              </Card>
            ) : null}

            {detail.abi ? (
              <Card className="border-white/6 bg-black/20 shadow-none">
                <CardHeader>
                  <CardTitle className="text-white">ABI</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-white/8 bg-slate-950/80 p-4 text-xs leading-6 text-slate-200">
                    {prettyJson(detail.abi)}
                  </pre>
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-cyan-100">
                <Fingerprint className="size-5" />
                <CardTitle className="text-white">Similar contracts</CardTitle>
              </div>
              <CardDescription>
                Nearest bytecode neighbors from pgvector to help spot clones or variants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(similar || []).length ? (
                similar!.map((match) => (
                  <Link
                    key={match.address}
                    href={`/contracts/${encodeURIComponent(match.address)}`}
                    className="block rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {formatAddress(match.address, 8)}
                        </div>
                        <div className="mt-1 text-sm text-slate-300/76">
                          Similarity {formatSimilarity(match.similarity)}
                        </div>
                      </div>
                      <Badge variant={match.flagged ? "danger" : "outline"}>
                        {match.flagged ? "flagged" : "observed"}
                      </Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-300/72">
                  No similar contracts were returned for this bytecode yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-cyan-100">
                <ShieldAlert className="size-5" />
                <CardTitle className="text-white">Review guidance</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300/80">
              <p>
                Start with the similar-contract matches if you suspect a cloned
                scam or templated deployment pattern.
              </p>
              <p>
                If the contract is moving value unusually fast, pivot to the
                account dossier and then into the graph view for multi-hop
                tracing.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
