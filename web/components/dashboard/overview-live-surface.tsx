"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Filter,
  MoreHorizontal,
  Network,
  ShieldAlert,
} from "lucide-react";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  cn,
  formatAddress,
  formatCount,
  formatDateTime,
  formatPercent,
  formatWeiToEth,
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

function sumWei(values: string[]) {
  return values.reduce((sum, value) => {
    if (!value || !/^-?\d+$/.test(value)) {
      return sum;
    }
    return sum + BigInt(value);
  }, BigInt(0));
}

function formatWindowLabel(value?: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function calculateDelta(current: number, previous: number) {
  if (!previous) {
    return current ? 100 : 0;
  }

  return ((current - previous) / Math.max(previous, 1)) * 100;
}

function buildPoints(values: number[], width: number, height: number, padding: number) {
  const safe = values.length ? values : [0, 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;

  return safe.map((value, index) => {
    const x =
      safe.length === 1
        ? width / 2
        : padding + (index / (safe.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y, value };
  });
}

function OverviewTrendChart({
  primary,
  secondary,
  labels,
}: {
  primary: number[];
  secondary: number[];
  labels: string[];
}) {
  const width = 760;
  const height = 250;
  const padding = 22;
  const safePrimary = primary.length ? primary : [0, 0, 0, 0];
  const safeSecondary =
    secondary.length === safePrimary.length
      ? secondary
      : new Array(safePrimary.length).fill(0);
  const primaryPoints = buildPoints(safePrimary, width, height, padding);
  const secondaryPoints = buildPoints(safeSecondary, width, height, padding);
  const selectedIndex = Math.min(
    safePrimary.length - 1,
    Math.max(0, Math.floor(safePrimary.length * 0.42)),
  );
  const selectedPrimary = primaryPoints[selectedIndex];
  const selectedSecondary = secondaryPoints[selectedIndex];
  const area = [
    `${padding},${height - padding}`,
    ...primaryPoints.map((point) => `${point.x},${point.y}`),
    `${width - padding},${height - padding}`,
  ].join(" ");
  const maxValue = Math.max(...safePrimary, ...safeSecondary, 1);
  const yLabels = [1, 0.75, 0.5, 0.25, 0].map((ratio) =>
    formatCount(Math.round(maxValue * ratio)),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[38px_minmax(0,1fr)]">
      <div className="flex h-[250px] flex-col justify-between pt-1 text-[11px] text-[#abb2a9]">
        {yLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div>
        <div className="relative h-[250px] overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(251,252,249,0.7),rgba(246,248,242,0.9))]">
          <div
            className="pointer-events-none absolute z-10 rounded-[18px] border border-[#e8ede5] bg-white px-3 py-2 shadow-[0_16px_35px_rgba(25,40,26,0.09)]"
            style={{
              left: `${(selectedPrimary.x / width) * 100}%`,
              top: `${Math.max(14, selectedPrimary.y - 76)}px`,
              transform: "translateX(-35%)",
            }}
          >
            <div className="text-[11px] font-medium text-[#7b887d]">
              {labels[selectedIndex] || "Current window"}
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-2 text-[#556357]">
                  <span className="size-2 rounded-full bg-[#26b54a]" />
                  Transactions
                </span>
                <span className="font-semibold text-[#132118]">
                  {formatCount(selectedPrimary.value)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-2 text-[#556357]">
                  <span className="size-2 rounded-full bg-[#ef5c43]" />
                  Addresses
                </span>
                <span className="font-semibold text-[#132118]">
                  {formatCount(selectedSecondary.value)}
                </span>
              </div>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full"
            preserveAspectRatio="none"
            aria-label="Transactions and unique addresses over time"
          >
            <defs>
              <linearGradient id="overview-primary-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(38, 181, 74, 0.22)" />
                <stop offset="100%" stopColor="rgba(38, 181, 74, 0.02)" />
              </linearGradient>
            </defs>

            {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
              <line
                key={ratio}
                x1={padding}
                x2={width - padding}
                y1={padding + ratio * (height - padding * 2)}
                y2={padding + ratio * (height - padding * 2)}
                stroke="rgba(162, 171, 159, 0.18)"
                strokeDasharray="4 7"
              />
            ))}

            <polygon points={area} fill="url(#overview-primary-fill)" />

            <polyline
              points={primaryPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#25b74b"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={secondaryPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#ef5c43"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <line
              x1={selectedPrimary.x}
              x2={selectedPrimary.x}
              y1={padding}
              y2={height - padding}
              stroke="#b6bdb3"
              strokeDasharray="5 7"
            />

            <circle cx={selectedPrimary.x} cy={selectedPrimary.y} r="5.5" fill="#ffffff" stroke="#25b74b" strokeWidth="2.5" />
            <circle cx={selectedSecondary.x} cy={selectedSecondary.y} r="5.5" fill="#ffffff" stroke="#ef5c43" strokeWidth="2.5" />
          </svg>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2 text-center text-[11px] text-[#98a198] sm:grid-cols-8">
          {labels.map((label, index) => (
            <span key={`${label}:${index}`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricPanel({
  title,
  value,
  change,
  detail,
  icon,
  href,
}: {
  title: string;
  value: string;
  change: number;
  detail: string;
  icon: React.ReactNode;
  href: string;
}) {
  const positive = change >= 0;

  return (
    <div className="rounded-[24px] border border-[#e8ebe4] bg-[#fdfefb] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[#263328]">
          <span className="flex size-6 items-center justify-center rounded-full bg-[#f0f5eb] text-[#2b6631]">
            {icon}
          </span>
          {title}
        </div>
        <Link
          href={href}
          className="text-xs font-medium text-[#869188] transition hover:text-[#2b6631]"
        >
          View more
        </Link>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-[2rem] font-semibold leading-none tracking-tight text-[#152319]">
          {value}
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            positive
              ? "bg-[#e8f6ea] text-[#239140]"
              : "bg-[#f9e3df] text-[#c45543]",
          )}
        >
          {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {formatPercent(Math.abs(change))}
        </div>
      </div>
      <div className="mt-2 text-sm text-[#8a948b]">{detail}</div>
    </div>
  );
}

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
      const [nextTopAddresses, nextRecentContracts, nextNetworkMetrics] = await Promise.all([
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
      // Preserve the last stable snapshot during demo sessions.
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
  const flaggedContracts = recentContracts.filter((contract) => contract.flagged).length;
  const highSeverityCount = recentFlags.filter((flag) => flag.severity === "high").length;
  const totalNetworkValue = useMemo(
    () => sumWei(networkMetrics.map((point) => point.total_value)).toString(),
    [networkMetrics],
  );
  const splitIndex = Math.max(1, Math.floor(networkMetrics.length / 2));
  const previousWindowValue = sumWei(
    networkMetrics.slice(0, splitIndex).map((point) => point.total_value),
  );
  const currentWindowValue = sumWei(
    networkMetrics.slice(splitIndex).map((point) => point.total_value),
  );
  const valueChange =
    previousWindowValue === BigInt(0)
      ? currentWindowValue > BigInt(0)
        ? 100
        : 0
      : Number(currentWindowValue - previousWindowValue) /
        Number(previousWindowValue) *
        100;

  const latestMetric = networkMetrics.at(-1);
  const previousMetric = networkMetrics.at(-2);
  const transactionDelta = calculateDelta(
    latestMetric?.transaction_count || 0,
    previousMetric?.transaction_count || 0,
  );
  const addressDelta = calculateDelta(
    latestMetric?.unique_addresses || 0,
    previousMetric?.unique_addresses || 0,
  );
  const signalDelta = calculateDelta(
    highSeverityCount,
    Math.max(recentFlags.length - highSeverityCount, 0),
  );

  const chartWindow = networkMetrics.slice(-8);
  const chartPrimary = chartWindow.map((point) => point.transaction_count);
  const chartSecondary = chartWindow.map((point) => point.unique_addresses);
  const chartLabels = chartWindow.map((point) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(point.bucket)),
  );

  const firstBucket = networkMetrics[0]?.bucket;
  const lastBucket = networkMetrics.at(-1)?.bucket;
  const relatedFlagByHash = new Map(
    recentFlags
      .filter((flag) => flag.tx_hash)
      .map((flag) => [flag.tx_hash, flag] as const),
  );
  const topAddress = topAddresses[0];
  const riskFocusShare = recentFlags.length
    ? (highSeverityCount / recentFlags.length) * 100
    : 0;
  const contractFocusShare = recentContracts.length
    ? (flaggedContracts / recentContracts.length) * 100
    : 0;

  return (
    <div className="space-y-5 pb-4 lg:space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.55rem] font-semibold tracking-tight text-[#162317] lg:text-[1.8rem]">
            Welcome Back, Investigator
          </h1>
          <p className="mt-1 text-sm text-[#8a948b]">
            A concise view of network movement, risk signals, and the most useful places to start.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-[#e7eae3] bg-[#f7f8f4] px-3 py-2 text-xs font-medium text-[#4f5c51]">
            Last 24 Hours
          </div>
          <div className="rounded-xl border border-[#e7eae3] bg-[#fbfcf8] px-3 py-2 text-xs font-medium text-[#4f5c51]">
            {formatWindowLabel(firstBucket)} - {formatWindowLabel(lastBucket)}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xl border border-[#e7eae3] bg-[#fbfcf8] px-3 py-2 text-xs font-medium text-[#4f5c51] transition hover:bg-white"
          >
            <Filter className="size-3.5" />
            Export
          </button>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#2a5f2d_0%,#244f27_100%)] px-5 py-5 text-white shadow-[0_18px_42px_rgba(31,77,35,0.25)] sm:px-6 sm:py-6">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -right-8 top-4 h-36 w-36 rounded-[32px] bg-[#7db676]/20 rotate-12" />
          <div className="absolute right-24 top-8 h-20 w-20 rounded-[22px] bg-[#7db676]/18 rotate-12" />
          <div className="absolute right-44 bottom-3 h-24 w-24 rounded-[28px] bg-[#7db676]/16 rotate-12" />
          <div className="absolute right-6 bottom-5 h-28 w-28 rounded-[30px] bg-[#7db676]/14 rotate-12" />
        </div>

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-white/78">Network Snapshot</div>
            <div className="mt-3 text-[2rem] font-semibold tracking-tight sm:text-[2.35rem]">
              {formatWeiToEth(totalNetworkValue)}
            </div>
            <div className="mt-2 text-sm text-white/72">
              Value moved across the currently indexed Ethereum activity window.
            </div>
            <div className="mt-3 text-sm text-white/78">
              Signal volume changed{" "}
              <span className="font-semibold text-[#7fff9b]">
                {valueChange >= 0 ? "+" : ""}
                {formatPercent(valueChange)}
              </span>{" "}
              versus the previous half-window.
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-9 rounded-xl bg-[#2fe05b] px-4 text-[#0f2e14] hover:bg-[#3ae466]">
              <Link href="/alerts">Alerts</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="h-9 rounded-xl border-0 bg-white/12 px-4 text-white hover:bg-white/18"
            >
              <Link href="/graph">Trace</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="h-9 rounded-xl border-0 bg-white/12 px-4 text-white hover:bg-white/18"
            >
              <Link href="/cases">Cases</Link>
            </Button>
            <Button
              asChild
              size="icon"
              variant="secondary"
              className="size-9 rounded-xl border-0 bg-white/12 text-white hover:bg-white/18"
            >
              <Link href="/contracts" aria-label="Open contracts">
                <MoreHorizontal className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MetricPanel
          title="Network Transactions"
          value={formatCount(overview?.transaction_count || 0)}
          change={transactionDelta}
          detail={`vs ${formatCount(previousMetric?.transaction_count || 0)} in the prior hour`}
          icon={<Network className="size-3.5" />}
          href="/graph"
        />
        <MetricPanel
          title="Tracked Addresses"
          value={formatCount(latestMetric?.unique_addresses || overview?.account_count || 0)}
          change={addressDelta}
          detail={`${formatCount(overview?.contract_count || 0)} contracts already modeled`}
          icon={<BriefcaseBusiness className="size-3.5" />}
          href="/cases"
        />
        <MetricPanel
          title="Raised Signals"
          value={formatCount(overview?.flag_count || 0)}
          change={signalDelta}
          detail={`${formatCount(highSeverityCount)} recent high-severity flags in scope`}
          icon={<ShieldAlert className="size-3.5" />}
          href="/alerts"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(300px,0.86fr)]">
        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-base font-semibold text-[#1a271c]">Transaction History</div>
              <div className="mt-1 text-sm text-[#8a948b]">
                Indexed transaction throughput compared with unique active addresses.
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[#ecefe8] bg-[#f8f9f5] p-1 text-[11px] font-medium text-[#627165]">
              {["24H", "72H", "1W"].map((item, index) => (
                <span
                  key={item}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5",
                    index === 0 ? "bg-white text-[#1f2c20] shadow-sm" : "",
                  )}
                >
                  {item}
                </span>
              ))}
              <span className="ml-1 flex items-center gap-1 rounded-lg px-2.5 py-1.5">
                <Filter className="size-3" />
                Filter
              </span>
            </div>
          </div>

          <div className="mt-5">
            <OverviewTrendChart
              primary={chartPrimary}
              secondary={chartSecondary}
              labels={chartLabels}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[#1a271c]">Risk Flow</div>
              <div className="mt-1 text-sm text-[#8a948b]">
                Active risk pressure from alerts and contract review.
              </div>
            </div>
            <Link
              href="/alerts"
              className="text-xs font-medium text-[#869188] transition hover:text-[#2b6631]"
            >
              View more
            </Link>
          </div>

          <div className="mt-5 text-[2rem] font-semibold leading-none text-[#172318]">
            {formatCount(overview?.flag_count || 0)}
          </div>
          <div className="mt-2 text-sm text-[#8a948b]">
            total signals surfaced in the current investigation store
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-[#172318]">
                    {formatCount(highSeverityCount)}
                  </div>
                  <div className="mt-1 text-sm text-[#7e887f]">
                    high-severity flags
                  </div>
                </div>
                <div className="text-xs font-medium text-[#8a948b]">
                  {formatPercent(riskFocusShare)} risk focus
                </div>
              </div>
              <div className="mt-3 h-12 rounded-[18px] bg-[#f1f4ee] px-3 py-2">
                <div
                  className="h-full rounded-[12px] bg-[linear-gradient(90deg,#28d94f_0%,#1fb743_100%)]"
                  style={{ width: `${Math.max(14, riskFocusShare)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-[#172318]">
                    {formatCount(flaggedContracts)}
                  </div>
                  <div className="mt-1 text-sm text-[#7e887f]">
                    flagged contracts
                  </div>
                </div>
                <div className="text-xs font-medium text-[#8a948b]">
                  {formatPercent(contractFocusShare)} recent slice
                </div>
              </div>
              <div className="mt-3 h-12 rounded-[18px] bg-[#f7f0ef] px-3 py-2">
                <div className="flex h-full items-center gap-1 overflow-hidden rounded-[12px]">
                  {Array.from({ length: 20 }).map((_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-full flex-1 rounded-full",
                        index < Math.max(2, Math.round((contractFocusShare / 100) * 20))
                          ? "bg-[#ef5c43]"
                          : "bg-[#f3d4cf]",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[22px] border border-[#ecefe8] bg-[#f6f7f3] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#95a094]">
              Next best pivot
            </div>
            <div className="mt-2 text-sm font-medium text-[#1c2a1d]">
              {topAddress
                ? `${formatAddress(topAddress.address, 8)} is currently the most active visible node.`
                : "No address activity has been indexed yet."}
            </div>
            <div className="mt-2 text-sm text-[#7e887f]">
              Queue depth {formatCount(queueDepth)} · oldest pending{" "}
              {formatDateTime(enrichment?.oldest_pending_at)}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-base font-semibold text-[#1a271c]">Recent Activity</div>
            <div className="mt-1 text-sm text-[#8a948b]">
              Latest ledger events with direct pivots into transactions and dossiers.
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-[#ecefe8] bg-[#f8f9f5] p-1 text-[11px] font-medium text-[#627165]">
            {["1H", "6H", "24H"].map((item, index) => (
              <span
                key={item}
                className={cn(
                  "rounded-lg px-2.5 py-1.5",
                  index === 2 ? "bg-white text-[#1f2c20] shadow-sm" : "",
                )}
              >
                {item}
              </span>
            ))}
            <span className="ml-1 flex items-center gap-1 rounded-lg px-2.5 py-1.5">
              <Filter className="size-3" />
              Filter
            </span>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[22px] border border-[#ecefe8]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[#f3f5f1] text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#909b91]">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length ? (
                  recentTransactions.map((tx) => {
                    const relatedFlag = relatedFlagByHash.get(tx.hash);
                    const typeLabel = tx.to ? "Transfer" : "Deploy";
                    const statusLabel = relatedFlag
                      ? relatedFlag.severity === "high"
                        ? "Critical"
                        : "Flagged"
                      : "Observed";

                    return (
                      <tr
                        key={tx.hash}
                        className="border-t border-[#edf0e9] bg-white transition hover:bg-[#f8faf5]"
                      >
                        <td className="px-4 py-4">
                          <Link
                            href={`/transactions/${encodeURIComponent(tx.hash)}`}
                            className="flex min-w-[140px] items-center gap-3"
                          >
                            <span
                              className={cn(
                                "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                                tx.to ? "bg-[#2f5f33]" : "bg-[#ef5c43]",
                              )}
                            >
                              {tx.to ? "T" : "D"}
                            </span>
                            <span>
                              <span className="block font-medium text-[#1d2b1e]">
                                {typeLabel}
                              </span>
                              <span className="block font-mono text-[11px] text-[#8a948b]">
                                {formatAddress(tx.hash, 6)}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-4 font-medium text-[#1d2b1e]">
                          {formatWeiToEth(tx.value)}
                        </td>
                        <td className="px-4 py-4 text-[#5b685d]">
                          {formatAddress(tx.from, 5)} →{" "}
                          {formatAddress(tx.to || "contract creation", 5)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            className={relatedFlag ? riskTone(relatedFlag.severity) : undefined}
                            variant={relatedFlag ? "outline" : "success"}
                          >
                            {statusLabel}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-[#5b685d]">
                          {relatedFlag
                            ? formatAddress(relatedFlag.address, 6)
                            : formatAddress(tx.to || tx.from, 6)}
                        </td>
                        <td className="px-4 py-4 text-[#5b685d]">
                          {formatDateTime(tx.timestamp)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#8a948b]">
                      No recent activity is available from the backend yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
