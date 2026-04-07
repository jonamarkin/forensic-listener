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
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7b887d]">
                  Bytecode size
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#132118]">
                  {detail.bytecode_size.toLocaleString()}
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7b887d]">
                  Verified
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#132118]">
                  {detail.verified ? "Yes" : "No"}
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7b887d]">
                  Compiler
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#132118]">
                  {detail.compiler_version || "Unknown"}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4">
                <div className="text-sm font-semibold text-[#132118]">Lifecycle</div>
                <div className="mt-3 space-y-2 text-sm text-[#556357]">
                  <div>First seen: {formatDateTime(detail.first_seen)}</div>
                  <div>Last seen: {formatDateTime(detail.last_seen)}</div>
                  <div>Address: {detail.address}</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4">
                <div className="text-sm font-semibold text-[#132118]">Intelligence context</div>
                <div className="mt-3 space-y-2 text-sm text-[#556357]">
                  <div>Entity name: {detail.entity_name || "Unlabeled"}</div>
                  <div>Risk level: {detail.risk_level || "Unknown"}</div>
                  <div>Source artifacts: {detail.source_code ? "available" : "missing"}</div>
                </div>
              </div>
            </div>

            <Card className="border-[#dbe3d8] bg-[#fdfefb] shadow-none">
              <CardHeader>
                <div className="flex items-center gap-2 text-[#2b6631]">
                  <Binary className="size-5" />
                  <CardTitle className="text-[#132118]">Bytecode</CardTitle>
                </div>
                <CardDescription>
                  Use this as the low-level fingerprint when source code is not available.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
                  {detail.bytecode || "No bytecode stored."}
                </pre>
              </CardContent>
            </Card>

            {detail.source_code ? (
              <Card className="border-[#dbe3d8] bg-[#fdfefb] shadow-none">
                <CardHeader>
                  <CardTitle className="text-[#132118]">Source code</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
                    {detail.source_code}
                  </pre>
                </CardContent>
              </Card>
            ) : null}

            {detail.decompiled_code ? (
              <Card className="border-[#dbe3d8] bg-[#fdfefb] shadow-none">
                <CardHeader>
                  <CardTitle className="text-[#132118]">Decompiled view</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
                    {detail.decompiled_code}
                  </pre>
                </CardContent>
              </Card>
            ) : null}

            {detail.abi ? (
              <Card className="border-[#dbe3d8] bg-[#fdfefb] shadow-none">
                <CardHeader>
                  <CardTitle className="text-[#132118]">ABI</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[320px] overflow-auto rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-xs leading-6 text-[#314137]">
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
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Fingerprint className="size-5" />
                <CardTitle className="text-[#132118]">Similar contracts</CardTitle>
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
                      <Badge variant={match.flagged ? "danger" : "outline"}>
                        {match.flagged ? "flagged" : "observed"}
                      </Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-[#6f7b72]">
                  No similar contracts were returned for this bytecode yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-[#2b6631]">
                <ShieldAlert className="size-5" />
                <CardTitle className="text-[#132118]">Review guidance</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#556357]">
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
