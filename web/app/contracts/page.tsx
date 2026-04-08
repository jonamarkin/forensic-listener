import Link from "next/link";
import { ArrowRight, Fingerprint, Network, ScanSearch } from "lucide-react";

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
import type { ContractSummary } from "@/lib/types";
import {
  formatAddress,
  formatCount,
  formatDateTime,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

function ContractQueueMetric({
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

export default async function ContractsLandingPage() {
  const recentContracts =
    (await maybeApiFetch<ContractSummary[]>("/contracts/recent?limit=12")) || [];
  const visibleContracts = recentContracts.slice(0, 8);
  const flaggedCount = recentContracts.filter((contract) => contract.flagged).length;

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_360px]">
        <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,#16361b_0%,#265a2f_55%,#8fbc7d_100%)] text-white shadow-[0_22px_70px_rgba(18,41,23,0.18)]">
          <CardContent className="flex h-full flex-col justify-between gap-8 p-7 sm:p-8">
            <div className="space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-white/70">
                Contract Intelligence
              </p>
              <div className="space-y-3">
                <h1 className="max-w-xl text-3xl font-semibold tracking-[-0.04em] sm:text-[2.6rem]">
                  Review code-bearing entities in a dedicated contract queue.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-white/76">
                  Recent deployments, flagged bytecode, and direct links into similarity and graph tracing.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="bg-white text-[#16361b] hover:bg-[#f3f7ef]"
              >
                <Link href="/graph">
                  Open graph
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="border-white/25 bg-white/12 text-white hover:bg-white/18"
              >
                <Link href="/overview">
                  Return to dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <ContractQueueMetric
            label="Recent contracts"
            value={formatCount(recentContracts.length)}
            detail="Latest bytecode-bearing addresses in the current slice"
          />
          <ContractQueueMetric
            label="Flagged deployments"
            value={formatCount(flaggedCount)}
            detail="Suspicious contracts inside the recent slice"
          />
          <ContractQueueMetric
            label="Similarity matches"
            value={formatCount(visibleContracts.length)}
            detail="Contracts ready for similarity review"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-2 text-[#2b6631]">
              <ScanSearch className="size-5" />
              <CardTitle className="text-[#132118]">Recent contract queue</CardTitle>
            </div>
            <CardDescription>
              Recent contracts available for bytecode review.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {visibleContracts.length ? (
              visibleContracts.map((contract) => (
                <Link
                  key={contract.address}
                  href={`/contracts/${encodeURIComponent(contract.address)}`}
                  className="block rounded-[26px] border border-[#dbe3d8] bg-white/82 p-5 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[#132118]">
                        {formatAddress(contract.address, 9)}
                      </div>
                      <div className="mt-1 text-sm text-[#5d6a60]">
                        First seen {formatDateTime(contract.first_seen)}
                      </div>
                    </div>
                    <Badge
                      className={
                        contract.flagged
                          ? "bg-[#f5d9d7] text-[#933f34] border-[#e9b8b3]"
                          : "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]"
                      }
                    >
                      {contract.flagged ? "flagged" : "observed"}
                    </Badge>
                  </div>
                  <div className="mt-4 text-sm text-[#5d6a60]">
                    Bytecode size {formatCount(contract.bytecode_size)} · last seen{" "}
                    {formatDateTime(contract.last_seen)}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                No recent contracts are available from the backend yet.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Fingerprint className="size-5" />
                <CardTitle className="text-[#132118]">Review priorities</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#556357]">
              <p>Open a contract for bytecode, source artifacts, and nearest matches.</p>
              <p>Prioritize flagged rows, then use similarity and graph tracing to check broader patterns.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Network className="size-5" />
                <CardTitle className="text-[#132118]">Graph follow-up</CardTitle>
              </div>
              <CardDescription>
                Use graph tracing when fund movement matters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#556357]">
              <p>Open the graph workspace to trace contract-related flows.</p>
              <Button asChild variant="secondary">
                <Link href="/graph">
                  Open graph workspace
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
