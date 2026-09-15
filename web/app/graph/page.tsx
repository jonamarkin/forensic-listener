import Link from "next/link";
import { AlertTriangle, ArrowRight, Network, Repeat, Route } from "lucide-react";

import { GraphMap } from "@/components/dashboard/graph-map";
import { QueryDisclosure } from "@/components/dashboard/query-disclosure";
import { SourceTag } from "@/components/dashboard/source-tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiResult } from "@/lib/api";
import { QUERIES } from "@/lib/queries";
import type { AccountProfile, AddressGraph, AddressTrace, CircularFlow, HubSummary } from "@/lib/types";
import { formatAddress, formatBaseUnits, formatDateTime, formatExact, formatRelativeTime, formatWeiToEth, riskTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const FLOW_OPTIONS = [
  { value: "all", label: "ETH and tokens" },
  { value: "eth", label: "ETH only" },
  { value: "token", label: "Tokens only" },
];

function first(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function clampInt(raw: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? fallback : Math.min(max, Math.max(min, value));
}

const selectClass =
  "flex h-11 w-full rounded-[20px] border border-[color:var(--border)] bg-white px-4 text-sm text-[#132118] outline-none focus:border-[#97bf89] focus:ring-2 focus:ring-[#d5e8ce]";

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)] ${className}`}>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "flex items-start gap-3 rounded-[20px] border border-[#ecc5c0] bg-[#fcefed] px-4 py-3 text-sm text-[#7f2f27]"
          : "flex items-start gap-3 rounded-[20px] border border-[#dfe6da] bg-[#f5f8f2] px-4 py-3 text-sm text-[#4f5d52]"
      }
    >
      {tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : null}
      <div>{children}</div>
    </div>
  );
}

function LoopList({ loops }: { loops: CircularFlow[] }) {
  if (!loops.length) {
    return <p className="text-sm text-[#6f7b72]">No circular flows detected yet.</p>;
  }
  return (
    <div className="space-y-3">
      {loops.map((loop) => (
        <Link
          key={loop.flag_id}
          href={`/graph?address=${loop.path[1] ?? loop.address}&depth=2&to=${loop.path[0] ?? ""}`}
          className="block rounded-[20px] border border-[#ecefe8] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[#132118]">{loop.hops}-transfer loop</span>
            <Badge className={riskTone(loop.severity)}>{loop.severity}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 font-mono text-[11px] text-[#5d6a60]">
            {loop.path.map((address, index) => (
              <span key={`${address}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <span className="text-[#9aa59b]">→</span> : null}
                {formatAddress(address, 3)}
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-[#7e887f]">
            {loop.kinds.includes("token") ? "includes token transfers · " : ""}detected {formatRelativeTime(loop.detected_at)}
          </div>
        </Link>
      ))}
    </div>
  );
}

export default async function GraphPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const address = first(query.address);
  const target = first(query.to);
  const depth = clampInt(first(query.depth), 2, 1, 3);
  const hops = clampInt(first(query.hops), 4, 1, 6);
  const flows = FLOW_OPTIONS.some((o) => o.value === first(query.flows)) ? first(query.flows) : "all";
  const invalidAddress = address !== "" && !ADDRESS.test(address);
  const invalidTarget = target !== "" && !ADDRESS.test(target);

  const [hubs, loops] = await Promise.all([
    apiResult<HubSummary[]>("/entities/hubs?limit=6"),
    apiResult<CircularFlow[]>("/forensics/circular?limit=5"),
  ]);

  let graph: AddressGraph | null = null;
  let graphError: string | null = null;
  let trace: AddressTrace | null = null;
  let traceError: string | null = null;
  let profile: AccountProfile | null = null;

  if (address && !invalidAddress) {
    const [graphResult, traceResult, profileResult] = await Promise.all([
      apiResult<AddressGraph>(`/addresses/${address}/graph?depth=${depth}&flows=${flows}`),
      target && !invalidTarget
        ? apiResult<AddressTrace>(`/addresses/${address}/trace?to=${target}&depth=${hops}&flows=${flows}`)
        : Promise.resolve(null),
      apiResult<AccountProfile>(`/accounts/${address}/profile`),
    ]);
    graph = graphResult.data;
    graphError = graphResult.error;
    trace = traceResult?.data ?? null;
    traceError = traceResult?.error ?? null;
    profile = profileResult.data;
  }

  const highRisk = graph?.nodes.filter((n) => n.risk_level === "high").length ?? 0;
  const contracts = graph?.nodes.filter((n) => n.is_contract).length ?? 0;
  const onlyCenter = graph && graph.edges.length === 0;

  return (
    <div className="space-y-5 pb-4 lg:space-y-6">
      <section className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[1.6rem] font-semibold tracking-tight text-[#162317] lg:text-[1.85rem]">Graph workspace</h1>
            <SourceTag engine="neo4j" />
          </div>
          <p className="mt-1 max-w-3xl text-sm text-[#7b867c]">
            Addresses are nodes; ETH transactions (<code className="font-mono text-xs">:SENT</code>) and token transfers (
            <code className="font-mono text-xs">:TRANSFERRED</code>) are directed edges in Neo4j. Expand an address, or trace a
            route between two.
          </p>
        </div>
      </section>

      <Panel>
        <form action="/graph" className="grid gap-3 lg:grid-cols-[1.4fr_0.55fr_0.7fr_1.2fr_0.5fr_auto] lg:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[#4d5b50]">Start address</span>
            <Input id="graph-address" name="address" defaultValue={address} placeholder="0x…" autoComplete="off" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[#4d5b50]">Neighbourhood</span>
            <select id="graph-depth" name="depth" defaultValue={String(depth)} className={selectClass}>
              {[1, 2, 3].map((d) => (
                <option key={d} value={d}>
                  {d} hop{d > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[#4d5b50]">Flows</span>
            <select id="graph-flows" name="flows" defaultValue={flows} className={selectClass}>
              {FLOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[#4d5b50]">Trace to (optional)</span>
            <Input id="graph-to" name="to" defaultValue={target} placeholder="destination 0x…" autoComplete="off" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[#4d5b50]">Max hops</span>
            <select id="graph-hops" name="hops" defaultValue={String(hops)} className={selectClass}>
              {[2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="rounded-[20px]">
            Render
            <ArrowRight />
          </Button>
        </form>
      </Panel>

      {!address ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
                <Repeat className="size-4 text-[#2b6631]" />
                Start from a detected loop
              </div>
              <SourceTag engine="postgres" />
            </div>
            <p className="mt-1 mb-4 text-sm text-[#7b867c]">Circular flows found by the detector, with their paths stored as JSON evidence.</p>
            {loops.error ? <Notice tone="error">{loops.error}</Notice> : <LoopList loops={loops.data ?? []} />}
          </Panel>
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
                <Network className="size-4 text-[#2b6631]" />
                Highest-degree accounts
              </div>
              <SourceTag engine="neo4j" />
            </div>
            <p className="mt-1 mb-4 text-sm text-[#7b867c]">Accounts with the most transfers in the graph.</p>
            {hubs.error ? (
              <Notice tone="error">{hubs.error}</Notice>
            ) : (
              <div className="space-y-2">
                {(hubs.data ?? []).map((hub) => (
                  <Link
                    key={hub.address}
                    href={`/graph?address=${hub.address}&depth=1`}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-[#ecefe8] bg-white px-4 py-3 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#1c2a1d]">{hub.entity_name || formatAddress(hub.address, 6)}</span>
                      <span className="block text-xs text-[#7e887f]">{hub.entity_type} · {formatExact(hub.incoming_count)} in · {formatExact(hub.outgoing_count)} out</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatExact(hub.degree)}</span>
                  </Link>
                ))}
              </div>
            )}
            <QueryDisclosure query={QUERIES.topHubs} />
          </Panel>
        </section>
      ) : null}

      {invalidAddress ? <Notice tone="error">“{address}” is not an address. Enter 0x followed by 40 hex characters.</Notice> : null}
      {invalidTarget ? <Notice tone="error">The trace destination is not a valid address.</Notice> : null}
      {graphError ? <Notice tone="error">{graphError}</Notice> : null}

      {graph ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Addresses in view", value: formatExact(graph.nodes.length) },
              { label: "Transfers in view", value: formatExact(graph.edges.length) },
              { label: "Contracts", value: formatExact(contracts) },
              { label: "High-risk addresses", value: formatExact(highRisk) },
            ].map((item) => (
              <div key={item.label} className="rounded-[22px] border border-[#e8ebe4] bg-[#fdfefb] px-5 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-[#152319]">{item.value}</div>
              </div>
            ))}
          </section>

          {onlyCenter ? (
            <Notice tone="info">
              This address has no transfers in the graph yet. Enrichment adds edges shortly after a transaction is stored in PostgreSQL.
            </Notice>
          ) : null}
          {graph.truncated ? (
            <Notice tone="info">
              This neighbourhood is larger than shown: expansion stops once each hop level reaches its path budget, which keeps busy
              addresses fast. Reduce hops or open a neighbour to explore further.
            </Notice>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
            <div className="space-y-4">
              <GraphMap graph={graph} trace={trace} />
              <QueryDisclosure query={QUERIES.neighbourhood} />
            </div>

            <div className="space-y-4">
              {profile ? (
                <Panel>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">Centre</div>
                      <div className="mt-1 truncate text-base font-semibold text-[#1a271c]">{profile.entity_name || formatAddress(profile.address, 8)}</div>
                    </div>
                    <Badge className={riskTone(profile.risk_level)}>{profile.risk_level}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-[16px] bg-[#f5f7f2] p-3">
                      <dt className="text-xs text-[#7e887f]">Transactions</dt>
                      <dd className="font-semibold tabular-nums">{formatExact(profile.total_count)}</dd>
                    </div>
                    <div className="rounded-[16px] bg-[#f5f7f2] p-3">
                      <dt className="text-xs text-[#7e887f]">Token transfers</dt>
                      <dd className="font-semibold tabular-nums">{formatExact(profile.token_transfer_count)}</dd>
                    </div>
                  </dl>
                  <Button asChild variant="secondary" className="mt-4 w-full">
                    <Link href={`/accounts/${profile.address}`}>
                      Open profile
                      <ArrowRight />
                    </Link>
                  </Button>
                </Panel>
              ) : null}

              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
                    <Route className="size-4 text-[#d9771f]" />
                    Path trace
                  </div>
                  <SourceTag engine="neo4j" />
                </div>
                {!target ? (
                  <p className="mt-2 text-sm text-[#6f7b72]">Add a destination above to find the shortest directed route to it.</p>
                ) : traceError ? (
                  <div className="mt-3">
                    <Notice tone={traceError.includes("no directed path") ? "info" : "error"}>
                      {traceError.includes("no directed path")
                        ? `No directed route within ${hops} hops. Value may not have moved this way, or not within the observed data.`
                        : traceError}
                    </Notice>
                  </div>
                ) : trace ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-[#56645a]">
                      {trace.hops} hop{trace.hops === 1 ? "" : "s"} from {formatAddress(trace.from, 4)} to {formatAddress(trace.to, 4)}, highlighted in orange.
                    </p>
                    {trace.edges.map((edge, index) => (
                      <Link
                        key={`${edge.hash}-${index}`}
                        href={`/transactions/${edge.hash}`}
                        className="block rounded-[16px] border border-[#ecefe8] bg-white p-3 transition hover:border-[#e7b98b]"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-[#1c2a1d]">
                            {index + 1}. {formatAddress(edge.from, 4)} → {formatAddress(edge.to, 4)}
                          </span>
                          <Badge variant="outline">{edge.kind === "eth" ? "ETH" : "token"}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-[#6f7b72]">
                          {edge.kind === "eth" ? formatWeiToEth(edge.value) : formatBaseUnits(edge.value)} · {formatDateTime(edge.timestamp)}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}
                <QueryDisclosure query={QUERIES.tracePath} />
              </Panel>

              <Panel>
                <div className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
                  <Repeat className="size-4 text-[#2b6631]" />
                  Recent loops
                </div>
                <div className="mt-3">
                  {loops.error ? <Notice tone="error">{loops.error}</Notice> : <LoopList loops={(loops.data ?? []).slice(0, 3)} />}
                </div>
              </Panel>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
