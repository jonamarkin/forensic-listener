import Link from "next/link";
import { ArrowRight, Fingerprint, Network, ScanSearch } from "lucide-react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { maybeApiFetch } from "@/lib/api";
import type { ContractSummary } from "@/lib/types";
import { formatAddress, formatCount, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContractsLandingPage() {
  const recentContracts =
    (await maybeApiFetch<ContractSummary[]>("/contracts/recent?limit=12")) || [];

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Contract Intelligence"
        title="Browse code-bearing entities as a first-class surface."
        description="This route keeps contract review separate from wallet triage: recent deployments, flagged bytecode, and fast pivots into similarity or graph tracing."
        actions={
          <Button asChild>
            <Link href="/graph">
              Open graph
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[#2b6631]">
              <Fingerprint className="size-5" />
              <CardTitle className="text-[#132118]">Recent contracts</CardTitle>
            </div>
            <CardDescription>
              Latest bytecode-bearing addresses available for review.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-[#132118]">
            {formatCount(recentContracts.length)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[#2b6631]">
              <ScanSearch className="size-5" />
              <CardTitle className="text-[#132118]">Flagged deployments</CardTitle>
            </div>
            <CardDescription>
              Contracts already marked suspicious in the current recent slice.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-[#132118]">
            {formatCount(recentContracts.filter((contract) => contract.flagged).length)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[#2b6631]">
              <Network className="size-5" />
              <CardTitle className="text-[#132118]">Graph pivots ready</CardTitle>
            </div>
            <CardDescription>
              Every contract row links directly into graph tracing and dossier review.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-[#132118]">
            {formatCount(recentContracts.length)}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-[#132118]">Recent contract queue</CardTitle>
          <CardDescription>
            Use this as the starting list for bytecode review and clone hunting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {recentContracts.length ? (
            recentContracts.map((contract) => (
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
                  <Badge variant={contract.flagged ? "danger" : "outline"}>
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
            <p className="text-sm text-[#6f7b72]">
              No recent contracts are available from the backend yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
