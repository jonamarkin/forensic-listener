"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Blocks, Coins, Download, ShieldAlert, Users } from "lucide-react";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { PipelinePanel } from "@/components/dashboard/pipeline-panel";
import { QueryDisclosure } from "@/components/dashboard/query-disclosure";
import { SourceTag, SourceTags } from "@/components/dashboard/source-tag";
import { Badge } from "@/components/ui/badge";
import { clientApiFetch } from "@/lib/client-api";
import { FLAG_ENGINES, FLAG_LABELS } from "@/lib/flags";
import { QUERIES } from "@/lib/queries";
import type { AddressActivity, ForensicFlag, NetworkMetricPoint } from "@/lib/types";
import {
  cn,
  formatAddress,
  formatCount,
  formatDateTime,
  formatExact,
  formatRelativeTime,
  formatWeiToEth,
  riskTone,
  statusTone,
  txKind,
} from "@/lib/utils";

const WINDOWS = [
  { label: "24H", hours: 24 },
  { label: "72H", hours: 72 },
  { label: "7D", hours: 168 },
] as const;
const REFRESH_MS = 30_000;

type Props = {
  initialTopAddresses: AddressActivity[];
  initialNetworkMetrics: NetworkMetricPoint[];
  apiError: string | null;
};

function sumWei(values: string[]) {
  return values.reduce((sum, value) => (/^\d+$/.test(value) ? sum + BigInt(value) : sum), BigInt(0));
}

/** Rounds a raw tick step up to 1, 2 or 5 × 10^k. */
function niceStep(raw: number) {
  if (raw <= 1) return 1;
  const exponent = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / exponent;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent;
}

function bucketLabel(iso: string, multiDay: boolean) {
  return new Intl.DateTimeFormat(
    "en-US",
    multiDay
      ? { month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23", timeZone: "UTC" }
      : { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" },
  ).format(new Date(iso));
}

function HistoryChart({ points, hours }: { points: NetworkMetricPoint[]; hours: number }) {
  const width = 760;
  const height = 300;
  const padL = 52;
  const padR = 18;
  const padT = 16;
  const padB = 34;
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  if (!n) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-[22px] border border-dashed border-[#dbe3d8] text-sm text-[#627065]">
        No hourly history yet. The rollup refreshes every 30 seconds.
      </div>
    );
  }

  const peak = Math.max(0, ...points.map((p) => Math.max(p.transaction_count, p.unique_addresses)));
  const step = niceStep(peak / 4);
  const yMax = step * 4;
  const x = (i: number) => (n === 1 ? padL + (width - padL - padR) / 2 : padL + (i / (n - 1)) * (width - padL - padR));
  const y = (v: number) => padT + (1 - v / yMax) * (height - padT - padB);
  const txLine = points.map((p, i) => `${x(i)},${y(p.transaction_count)}`).join(" ");
  const addressLine = points.map((p, i) => `${x(i)},${y(p.unique_addresses)}`).join(" ");
  const multiDay = hours > 24;
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const active = hover ?? n - 1;
  const point = points[active];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Transactions and unique addresses per hour over the last ${hours} hours`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const svgX = ((event.clientX - rect.left) / rect.width) * width;
          const ratio = (svgX - padL) / (width - padL - padR);
          setHover(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
        }}
      >
        {[0, 1, 2, 3, 4].map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y(step * tick)} y2={y(step * tick)} stroke="#e3e8df" strokeDasharray={tick === 0 ? undefined : "3 5"} />
            <text x={padL - 10} y={y(step * tick) + 4} textAnchor="end" fontSize="11" fill="#8a948b">
              {formatCount(step * tick)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) || i === n - 1 ? (
            <text key={p.bucket} x={x(i)} y={height - 10} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="#8a948b">
              {bucketLabel(p.bucket, multiDay)}
            </text>
          ) : null,
        )}
        <polygon points={`${x(0)},${y(0)} ${txLine} ${x(n - 1)},${y(0)}`} fill="rgba(37,183,75,0.12)" />
        <polyline points={txLine} fill="none" stroke="#25a346" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={addressLine} fill="none" stroke="#2c5d88" strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" />
        <line x1={x(active)} x2={x(active)} y1={padT} y2={height - padB} stroke="#b6bdb3" strokeDasharray="4 4" />
        <circle cx={x(active)} cy={y(point.transaction_count)} r="4.5" fill="#fff" stroke="#25a346" strokeWidth="2.5" />
        <circle cx={x(active)} cy={y(point.unique_addresses)} r="4" fill="#fff" stroke="#2c5d88" strokeWidth="2" />
      </svg>
      <div
        className="pointer-events-none absolute top-1 w-[184px] rounded-xl border border-[#e3e8e0] bg-white/95 px-3 py-2 text-xs shadow-[0_10px_28px_rgba(25,40,26,0.1)]"
        style={{ left: `clamp(0px, calc(${(x(active) / width) * 100}% - 92px), calc(100% - 184px))` }}
      >
        <div className="font-medium text-[#56645a]">{bucketLabel(point.bucket, true)} UTC</div>
        <div className="mt-1.5 flex justify-between"><span className="text-[#25a346]">Transactions</span><b className="tabular-nums">{formatExact(point.transaction_count)}</b></div>
        <div className="flex justify-between"><span className="text-[#2c5d88]">Unique addresses</span><b className="tabular-nums">{formatExact(point.unique_addresses)}</b></div>
        <div className="flex justify-between"><span className="text-[#6b776d]">Value</span><b className="tabular-nums">{formatWeiToEth(point.total_value, 2)}</b></div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#e8ebe4] bg-[#fdfefb] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[#263328]">
          <span className="flex size-6 items-center justify-center rounded-full bg-[#f0f5eb] text-[#2b6631]">{icon}</span>
          {label}
        </div>
        <SourceTag engine="postgres" />
      </div>
      <div className="mt-4 text-[2rem] font-semibold leading-none tracking-tight tabular-nums text-[#152319]">{value}</div>
      <div className="mt-2 text-sm text-[#7b867c]">{detail}</div>
    </div>
  );
}

export function FlagListItem({ flag }: { flag: ForensicFlag }) {
  return (
    <Link
      href={flag.tx_hash ? `/transactions/${flag.tx_hash}` : `/accounts/${flag.address}`}
      className="block rounded-[20px] border border-[#ecefe8] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#172318]">{FLAG_LABELS[flag.flag_type] ?? flag.flag_type.replace(/_/g, " ")}</div>
          <div className="mt-1 text-sm leading-5 text-[#5f6b61] [overflow-wrap:anywhere]">{flag.description}</div>
        </div>
        <Badge className={riskTone(flag.severity)}>{flag.severity}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#7e887f]">
        <span>{formatRelativeTime(flag.detected_at)}</span>
        <SourceTags engines={FLAG_ENGINES[flag.flag_type] ?? ["postgres"]} />
      </div>
    </Link>
  );
}

export function OverviewLiveSurface({ initialTopAddresses, initialNetworkMetrics, apiError }: Props) {
  const { snapshot } = useLiveSnapshot();
  const [hours, setHours] = useState<number>(24);
  const [network, setNetwork] = useState(initialNetworkMetrics);
  const [topAddresses, setTopAddresses] = useState(initialTopAddresses);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(async (windowHours: number) => {
    try {
      const [points, top] = await Promise.all([
        clientApiFetch<NetworkMetricPoint[]>(`/stats/network?hours=${windowHours}`),
        clientApiFetch<AddressActivity[]>("/addresses/top?limit=6"),
      ]);
      startTransition(() => {
        setNetwork(points);
        setTopAddresses(top);
        setRefreshError(null);
      });
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Refreshing history failed.");
    }
  }, []);

  useEffect(() => {
    void refresh(hours);
    const timer = window.setInterval(() => void refresh(hours), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [hours, refresh]);

  const overview = snapshot?.overview;
  const recentTransactions = snapshot?.recent_transactions ?? [];
  const recentFlags = snapshot?.recent_flags ?? [];
  const windowTransactions = network.reduce((sum, p) => sum + p.transaction_count, 0);
  const windowValue = sumWei(network.map((p) => p.total_value)).toString();

  function exportCsv() {
    const header = "bucket_utc,transaction_count,unique_addresses,avg_gas_price_wei,total_value_wei\n";
    const rows = network.map((p) => `${p.bucket},${p.transaction_count},${p.unique_addresses},${p.avg_gas_price},${p.total_value}`).join("\n");
    const url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `network-history-${hours}h.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 pb-4 lg:space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[1.6rem] font-semibold tracking-tight text-[#162317] lg:text-[1.85rem]">Overview</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#7b867c]">
            Transactions observed by the connected Ethereum node
            {overview?.first_transaction_at ? ` since ${formatDateTime(overview.first_transaction_at)}` : ""}: pending
            transactions from its mempool, and every transaction in each new block. This is not the whole chain history.
          </p>
        </div>
      </section>

      {apiError && !snapshot ? (
        <div role="alert" className="flex items-start gap-3 rounded-[20px] border border-[#ecc5c0] bg-[#fcefed] px-4 py-3 text-sm text-[#7f2f27]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{apiError}</span>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<Blocks className="size-3.5" />}
          label="Transactions"
          value={overview ? formatExact(overview.transaction_count) : "…"}
          detail={overview ? `${formatExact(overview.pending_count)} pending · ${formatExact(overview.block_count)} blocks ingested` : "Waiting for live data"}
        />
        <Kpi
          icon={<Users className="size-3.5" />}
          label="Addresses"
          value={overview ? formatExact(overview.account_count) : "…"}
          detail={overview ? `${formatExact(overview.contract_count)} identified as contracts` : "Waiting for live data"}
        />
        <Kpi
          icon={<Coins className="size-3.5" />}
          label="Token transfers"
          value={overview ? formatExact(overview.token_transfer_count) : "…"}
          detail="ERC-20 Transfer events decoded from receipts"
        />
        <Kpi
          icon={<ShieldAlert className="size-3.5" />}
          label="Forensic flags"
          value={overview ? formatExact(overview.flag_count) : "…"}
          detail={overview ? `${formatExact(overview.high_flag_count_24h)} high severity in the last 24 h` : "Waiting for live data"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(320px,0.9fr)]">
        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#1a271c]">Hourly activity</h2>
                <SourceTag engine="postgres" />
              </div>
              <p className="mt-1 text-sm text-[#7b867c]">
                {formatExact(windowTransactions)} transactions and {formatWeiToEth(windowValue, 2)} observed in this window (UTC hours).
              </p>
              <div className="mt-2 flex items-center gap-4 text-xs text-[#5d6a60]">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#25a346]" />transactions</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-[#2c5d88]" />unique addresses</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-[#ecefe8] bg-[#f8f9f5] p-1 text-[11px] font-medium text-[#627165]" role="group" aria-label="Time window">
                {WINDOWS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={hours === item.hours}
                    onClick={() => setHours(item.hours)}
                    className={cn("rounded-lg px-2.5 py-1.5 transition", hours === item.hours ? "bg-white text-[#1f2c20] shadow-sm" : "hover:bg-white/70")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1 rounded-xl border border-[#e7eae3] bg-[#fbfcf8] px-3 py-2 text-xs font-medium text-[#4f5c51] transition hover:bg-white"
              >
                <Download className="size-3.5" />
                CSV
              </button>
            </div>
          </div>
          {refreshError ? <p className="mt-2 text-xs text-[#933f34]">Could not refresh: {refreshError}</p> : null}
          <div className="mt-4">
            <HistoryChart points={network} hours={hours} />
          </div>
          <QueryDisclosure query={QUERIES.networkHistory} />
        </div>

        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <h2 className="text-base font-semibold text-[#1a271c]">Recent forensic flags</h2>
          <p className="mt-1 text-sm text-[#7b867c]">Raised by the detectors while enriching transactions.</p>
          <div className="mt-4 space-y-3">
            {recentFlags.slice(0, 5).length ? (
              recentFlags.slice(0, 5).map((flag) => <FlagListItem key={flag.id} flag={flag} />)
            ) : (
              <div className="rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm leading-6 text-[#627065]">
                No flags yet. Flags appear when value returns to its origin through a loop (Neo4j), or when a
                contract clones one labelled as risky (pgvector).
              </div>
            )}
          </div>
        </div>
      </section>

      <PipelinePanel />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(320px,0.9fr)]">
        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1a271c]">Latest transactions</h2>
              <p className="mt-1 text-sm text-[#7b867c]">The 12 most recently observed, updated every 2 seconds.</p>
            </div>
            <SourceTag engine="postgres" />
          </div>
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-[#ecefe8]">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[#f3f5f1] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#909b91]">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">From → To</th>
                  <th className="px-4 py-3">Seen</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length ? (
                  recentTransactions.map((tx) => (
                    <tr key={tx.hash} className="border-t border-[#edf0e9] bg-white">
                      <td className="px-4 py-3">
                        <Link href={`/transactions/${tx.hash}`} className="font-mono text-xs text-[#1d2b1e] underline-offset-2 hover:underline">
                          {formatAddress(tx.hash, 6)}
                        </Link>
                        <div className="text-[11px] text-[#8a948b]">{txKind(tx)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusTone(tx.status)}>{tx.status}</Badge>
                        {tx.block_number ? <div className="mt-1 text-[11px] text-[#8a948b]">block {formatExact(tx.block_number)}</div> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#1d2b1e]">{formatWeiToEth(tx.value, 3)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#5b685d]">
                        <Link href={`/accounts/${tx.from}`} className="hover:underline">{formatAddress(tx.from, 4)}</Link>
                        {" → "}
                        {tx.to ? (
                          <Link href={`/accounts/${tx.to}`} className="hover:underline">{formatAddress(tx.to, 4)}</Link>
                        ) : (
                          <span className="font-sans">new contract</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[#5b685d]">{formatRelativeTime(tx.timestamp)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#8a948b]">
                      No transactions observed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <QueryDisclosure query={QUERIES.liveCounts} />
        </div>

        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#1a271c]">Most active addresses</h2>
            <SourceTag engine="postgres" />
          </div>
          <p className="mt-1 text-sm text-[#7b867c]">By transactions sent and received, over all observed data.</p>
          <div className="mt-4 space-y-2">
            {topAddresses.length ? (
              topAddresses.map((item, index) => (
                <Link
                  key={item.address}
                  href={`/accounts/${item.address}`}
                  className="flex items-center justify-between gap-3 rounded-[18px] border border-[#ecefe8] bg-white px-4 py-3 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-4 text-xs tabular-nums text-[#9aa59b]">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#1c2a1d]">{item.entity_name || formatAddress(item.address, 6)}</span>
                      <span className="block text-xs text-[#7e887f]">{item.is_contract ? "contract" : "wallet"} · last seen {formatRelativeTime(item.last_seen)}</span>
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-[#1c2a1d]">
                    {formatExact(item.total_count)}
                    <span className="block text-[11px] font-normal text-[#8a948b]">{formatExact(item.sent_count)} out · {formatExact(item.received_count)} in</span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                No address activity yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
