"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Flag, Network, Sparkles, WalletCards } from "lucide-react";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { LineChart } from "@/components/dashboard/line-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { clientApiFetch } from "@/lib/client-api";
import type {
  AddressActivity,
  ContractSummary,
  EnrichmentStatus,
  ForensicFlag,
  NetworkMetricPoint,
  OverviewStats,
  Transaction,
} from "@/lib/types";
import {
  formatAddress,
  formatCount,
  formatDateTime,
  formatWeiToEth,
  formatWeiToGwei,
  riskTone,
} from "@/lib/utils";

const ANALYTICS_REFRESH_MS = 20_000;

type OverviewLiveSurfaceProps = {
  initialOverview: OverviewStats | null;
  initialEnrichment: EnrichmentStatus | null;
  initialTopAddresses: AddressActivity[];
  initialRecentTransactions: Transaction[];
  initialRecentFlags: ForensicFlag[];
  initialRecentContracts: ContractSummary[];
  initialNetworkMetrics: NetworkMetricPoint[];
};

export function OverviewLiveSurface({
  initialOverview,
  initialEnrichment,
  initialTopAddresses,
  initialRecentTransactions,
  initialRecentFlags,
  initialRecentContracts,
  initialNetworkMetrics,
}: OverviewLiveSurfaceProps) {
  const { snapshot } = useLiveSnapshot();
  const [overview, setOverview] = useState(initialOverview);
  const [enrichment, setEnrichment] = useState(initialEnrichment);
  const [topAddresses, setTopAddresses] = useState(initialTopAddresses);
  const [recentTransactions, setRecentTransactions] = useState(initialRecentTransactions);
  const [recentFlags, setRecentFlags] = useState(initialRecentFlags);
  const [recentContracts, setRecentContracts] = useState(initialRecentContracts);
  const [networkMetrics, setNetworkMetrics] = useState(initialNetworkMetrics);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    startTransition(() => {
      if (snapshot.overview) {
        setOverview(snapshot.overview);
      }
      if (snapshot.enrichment) {
        setEnrichment(snapshot.enrichment);
      }
      if (Array.isArray(snapshot.recent_transactions)) {
        setRecentTransactions(snapshot.recent_transactions);
      }
      if (Array.isArray(snapshot.recent_flags)) {
        setRecentFlags(snapshot.recent_flags);
      }
    });
  }, [snapshot]);

  const refreshAnalytics = useCallback(async () => {
    try {
      const [nextTopAddresses, nextRecentContracts, nextNetworkMetrics] =
        await Promise.all([
          clientApiFetch<AddressActivity[]>("/addresses/top?limit=6"),
          clientApiFetch<ContractSummary[]>("/contracts/recent?limit=6"),
          clientApiFetch<NetworkMetricPoint[]>("/stats/network?hours=24&bucket=hour"),
        ]);

      startTransition(() => {
        setTopAddresses(nextTopAddresses);
        setRecentContracts(nextRecentContracts);
        setNetworkMetrics(nextNetworkMetrics);
      });
    } catch {
      // Keep the last known analytics snapshot if the refresh fails.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshAnalytics();
    }, ANALYTICS_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshAnalytics]);

  const queueDepth =
    (enrichment?.pending || 0) +
    (enrichment?.processing || 0) +
    (enrichment?.retrying || 0);
  const networkValues = networkMetrics.map((point) => point.transaction_count);
  const latestNetworkPoint = networkMetrics.at(-1);
  const highSeverityCount = useMemo(
    () => recentFlags.filter((flag) => flag.severity === "high").length,
    [recentFlags],
  );

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Overview"
        title="Operational overview"
        description="Monitor ingestion health, queue pressure, recent activity, and the strongest investigative starting points."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/graph">
                Open graph
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/alerts">
                Open alerts
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          eyebrow="Transactions"
          value={formatCount(overview?.transaction_count ?? 0)}
          description="Observed Ethereum transactions indexed into the investigation surface."
          accent={<WalletCards className="size-6" />}
          footer={`Latest seen ${formatDateTime(overview?.latest_transaction_at)}`}
        />
        <MetricCard
          eyebrow="Accounts"
          value={formatCount(overview?.account_count ?? 0)}
          description="Tracked wallets and entities available for tracing and dossier review."
          accent={<Network className="size-6" />}
          footer={`${formatCount(overview?.contract_count ?? 0)} contracts modeled`}
        />
        <MetricCard
          eyebrow="Flags"
          value={formatCount(overview?.flag_count ?? 0)}
          description="Raised anomalies from circular flows, similarity checks, and other heuristics."
          accent={<Flag className="size-6" />}
          footer={`${highSeverityCount} recent high-severity hits`}
        />
        <MetricCard
          eyebrow="Enrichment Queue"
          value={formatCount(queueDepth)}
          description="Backlog waiting on enrichment workers, retries, or processing slots."
          accent={<Sparkles className="size-6" />}
          footer={`${formatCount(enrichment?.done ?? 0)} completed so far`}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-white">Network velocity</CardTitle>
                <CardDescription>
                  Twenty-four hour throughput and recent network context.
                </CardDescription>
              </div>
              <div className="rounded-2xl border border-cyan-300/18 bg-cyan-400/8 px-4 py-3 text-right">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">
                  Latest hour
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {formatCount(latestNetworkPoint?.transaction_count ?? 0)} tx
                </div>
                <div className="text-sm text-slate-300/80">
                  {formatWeiToGwei(latestNetworkPoint?.avg_gas_price ?? "0")} avg gas
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[230px] rounded-[24px] border border-white/6 bg-black/20 p-4">
              <LineChart values={networkValues} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {networkMetrics.slice(-3).map((point) => (
                <div
                  key={point.bucket}
                  className="rounded-[22px] border border-white/8 bg-black/20 p-4"
                >
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    {formatDateTime(point.bucket)}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatCount(point.transaction_count)} tx
                  </div>
                  <div className="mt-1 text-sm text-slate-300/78">
                    {formatCount(point.unique_addresses)} unique addresses
                  </div>
                  <div className="mt-1 text-sm text-slate-300/78">
                    {formatWeiToEth(point.total_value)} moved
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-white">Enrichment posture</CardTitle>
            <CardDescription>
              Queue pressure, retries, and the oldest unprocessed work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Pending", value: enrichment?.pending ?? 0, color: "bg-amber-400" },
              { label: "Processing", value: enrichment?.processing ?? 0, color: "bg-cyan-400" },
              { label: "Retrying", value: enrichment?.retrying ?? 0, color: "bg-rose-400" },
              { label: "Done", value: enrichment?.done ?? 0, color: "bg-emerald-400" },
            ].map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{item.label}</span>
                  <span className="font-semibold text-white">{formatCount(item.value)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/6">
                  <div
                    className={`h-2.5 rounded-full ${item.color}`}
                    style={{
                      width: `${Math.min(
                        100,
                        ((item.value || 0) /
                          Math.max(
                            1,
                            (enrichment?.pending || 0) +
                              (enrichment?.processing || 0) +
                              (enrichment?.retrying || 0) +
                              (enrichment?.done || 0),
                          )) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}

            <Separator />

            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Oldest pending item
              </p>
              <p className="mt-2 text-base font-medium text-white">
                {formatDateTime(enrichment?.oldest_pending_at)}
              </p>
              <p className="mt-2 text-sm text-slate-300/76">
                Use this to judge whether the pipeline is keeping pace with
                enrichment demand.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-white">High-activity addresses</CardTitle>
            <CardDescription>
              Fast pivots into the most active wallets and contracts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topAddresses.map((address) => (
              <Link
                key={address.address}
                href={`/accounts/${encodeURIComponent(address.address)}`}
                className="block w-full min-w-0 max-w-full rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
              >
                <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {formatAddress(address.address, 8)}
                    </div>
                    <div className="mt-1 break-words [overflow-wrap:anywhere] text-sm text-slate-300/75">
                      {address.is_contract ? "Contract" : "Wallet"} · last seen{" "}
                      {formatDateTime(address.last_seen)}
                    </div>
                  </div>
                  <div className="text-left sm:flex-shrink-0 sm:text-right">
                    <div className="text-lg font-semibold text-white">
                      {formatCount(address.total_count)}
                    </div>
                    <div className="text-sm text-slate-300/75">total tx</div>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-white">Recent forensic flags</CardTitle>
            <CardDescription>
              Newly raised anomalies ready for review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentFlags.map((flag) => (
              <div
                key={flag.id}
                className={`w-full min-w-0 max-w-full rounded-[24px] border p-4 ${riskTone(flag.severity)}`}
              >
                <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {flag.flag_type.replace(/_/g, " ")}
                    </div>
                    <div className="mt-1 break-words [overflow-wrap:anywhere] text-sm text-slate-100/85">
                      {flag.description}
                    </div>
                  </div>
                  <Badge
                    className="w-fit sm:flex-shrink-0"
                    variant={
                      flag.severity === "high"
                        ? "danger"
                        : flag.severity === "medium"
                          ? "warning"
                          : "success"
                    }
                  >
                    {flag.severity}
                  </Badge>
                </div>
                <div className="mt-3 break-words [overflow-wrap:anywhere] text-xs text-slate-200/80">
                  {formatDateTime(flag.detected_at)} · {formatAddress(flag.address)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-white">Latest transactions</CardTitle>
            <CardDescription>
              Recent ledger activity for manual inspection and quick pivots.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTransactions.map((tx) => (
              <div
                key={tx.hash}
                className="w-full min-w-0 max-w-full rounded-[24px] border border-white/8 bg-black/20 p-4"
              >
                <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-cyan-100">
                      {formatAddress(tx.hash, 10)}
                    </div>
                    <div className="mt-2 break-words [overflow-wrap:anywhere] text-sm text-slate-300/80">
                      <Link
                        className="font-semibold text-white transition hover:text-cyan-100"
                        href={`/accounts/${encodeURIComponent(tx.from)}`}
                      >
                        {formatAddress(tx.from)}
                      </Link>
                      {" → "}
                      <Link
                        className="font-semibold text-white transition hover:text-cyan-100"
                        href={`/accounts/${encodeURIComponent(tx.to)}`}
                      >
                        {formatAddress(tx.to || "contract creation")}
                      </Link>
                    </div>
                  </div>
                  <div className="text-left sm:flex-shrink-0 sm:text-right">
                    <div className="text-base font-semibold text-white">
                      {formatWeiToEth(tx.value)}
                    </div>
                    <div className="text-sm text-slate-300/74">
                      block {tx.block_number}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-start sm:justify-end">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/transactions/${encodeURIComponent(tx.hash)}`}>
                      Open transaction
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-white">Recent contract intelligence</CardTitle>
            <CardDescription>
              Newly observed contracts ready for similarity and code review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentContracts.map((contract) => (
              <Link
                key={contract.address}
                href={`/contracts/${encodeURIComponent(contract.address)}`}
                className="block w-full min-w-0 max-w-full rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
              >
                <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {formatAddress(contract.address, 8)}
                    </div>
                    <div className="mt-1 break-words [overflow-wrap:anywhere] text-sm text-slate-300/78">
                      Bytecode size {formatCount(contract.bytecode_size)}
                    </div>
                  </div>
                  <Badge className="w-fit sm:flex-shrink-0" variant={contract.flagged ? "danger" : "outline"}>
                    {contract.flagged ? "Flagged" : "Observed"}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
