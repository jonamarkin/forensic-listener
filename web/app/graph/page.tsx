import Link from "next/link";
import { ArrowRight, Binary, Compass, Route } from "lucide-react";

import { GraphMap } from "@/components/dashboard/graph-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maybeApiFetch } from "@/lib/api";
import type { AccountProfile, AddressGraph, AddressTrace, HubSummary } from "@/lib/types";
import { formatAddress, formatCount, formatDateTime, formatWeiToEth, riskTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

function GraphMetric({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-[#e8ebe4] bg-[#fdfefb] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
      <div className="flex items-center gap-2 text-sm font-medium text-[#263328]">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#f0f5eb] text-[#2b6631]">
          {icon}
        </span>
        {title}
      </div>
      <div className="mt-4 text-[2rem] font-semibold leading-none tracking-tight text-[#152319]">
        {value}
      </div>
      <div className="mt-2 text-sm text-[#8a948b]">{detail}</div>
    </div>
  );
}

export default async function GraphPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const hubs = (await maybeApiFetch<HubSummary[]>("/entities/hubs?limit=8")) || [];
  const rawDepth = Number(firstParam(query.depth) || "2");
  const depth = Math.min(Math.max(rawDepth, 1), 4);
  const address = firstParam(query.address) || hubs[0]?.address || "";
  const target = firstParam(query.to);

  const [graph, trace] = await Promise.all([
    address
      ? maybeApiFetch<AddressGraph>(
          `/addresses/${encodeURIComponent(address)}/graph?depth=${depth}`,
        )
      : Promise.resolve(null),
    address && target
      ? maybeApiFetch<AddressTrace>(
          `/addresses/${encodeURIComponent(address)}/trace?to=${encodeURIComponent(
            target,
          )}&depth=${depth}`,
        )
      : Promise.resolve(null),
  ]);
  const centerProfile = address
    ? await maybeApiFetch<AccountProfile>(
        `/accounts/${encodeURIComponent(address)}/profile`,
      )
    : null;
  const fallbackGraph =
    !graph && centerProfile
      ? {
          center: centerProfile.address,
          nodes: [
            {
              id: centerProfile.address,
              label: centerProfile.address,
              is_contract: centerProfile.is_contract,
              entity_type: centerProfile.entity_type,
              entity_name: centerProfile.entity_name,
              risk_level: centerProfile.risk_level,
              is_hub: centerProfile.is_hub,
              degree: 0,
            },
          ],
          edges: [],
        }
      : null;
  const effectiveGraph = graph ?? fallbackGraph;

  const flaggedNodes =
    effectiveGraph?.nodes.filter((node) => node.risk_level === "high").length ?? 0;
  const contractNodes = effectiveGraph?.nodes.filter((node) => node.is_contract).length ?? 0;
  const visibleEdges = effectiveGraph?.edges.length ?? 0;
  const topHubs = hubs.slice(0, 4);
  const traceEdges = (trace?.edges || []).slice(0, 4);
  const hasOnlyCenterNode =
    !!effectiveGraph &&
    effectiveGraph.nodes.length === 1 &&
    effectiveGraph.edges.length === 0 &&
    effectiveGraph.center.toLowerCase() === address.toLowerCase();

  return (
    <div className="space-y-5 pb-4 lg:space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.55rem] font-semibold tracking-tight text-[#162317] lg:text-[1.8rem]">
            Graph Workspace
          </h1>
          <p className="mt-1 text-sm text-[#8a948b]">
            Trace fund movement across nearby addresses and contracts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" className="rounded-xl">
            <Link href="/overview">
              Back to overview
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild className="rounded-xl">
            <Link href="/contracts">
              Open contracts
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-base font-semibold text-[#1a271c]">Trace controls</div>
            <div className="mt-1 text-sm text-[#8a948b]">
              Set the start address, hop depth, and optional destination.
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-[#ecefe8] bg-[#f8f9f5] p-1 text-[11px] font-medium text-[#627165]">
            {[1, 2, 3, 4].map((option) => (
              <span
                key={option}
                className={`rounded-lg px-2.5 py-1.5 ${depth === option ? "bg-white text-[#1f2c20] shadow-sm" : ""}`}
              >
                {option}H
              </span>
            ))}
            <span className="ml-1 rounded-lg px-2.5 py-1.5 text-[#8a948b]">
              Set in form
            </span>
          </div>
        </div>

        <form action="/graph" className="mt-5 grid gap-3 xl:grid-cols-[1.35fr_0.46fr_1fr_auto]">
          <Input
            name="address"
            defaultValue={address}
            placeholder="Start address"
          />
          <select
            name="depth"
            defaultValue={String(depth)}
            className="flex h-11 rounded-2xl border border-[#d7e2d0] bg-white px-4 text-sm text-[#132118] outline-none focus:border-[#97bf89] focus:ring-2 focus:ring-[#d5e8ce]"
          >
            {[1, 2, 3, 4].map((option) => (
              <option key={option} value={option}>
                {option} hop{option > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <Input
            name="to"
            defaultValue={target}
            placeholder="Optional destination address"
          />
          <Button type="submit" className="rounded-2xl">
            Render
            <ArrowRight className="size-4" />
          </Button>
        </form>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <GraphMetric
          title="Visible nodes"
          value={formatCount(effectiveGraph?.nodes.length ?? 0)}
          detail="Addresses and contracts currently inside the trace boundary."
          icon={<Binary className="size-3.5" />}
        />
        <GraphMetric
          title="Visible contracts"
          value={formatCount(contractNodes)}
          detail="Code-bearing nodes in the current trace."
          icon={<Compass className="size-3.5" />}
        />
        <GraphMetric
          title="High-risk nodes"
          value={formatCount(flaggedNodes)}
          detail={`${formatCount(visibleEdges)} directional edges currently rendered.`}
          icon={<Route className="size-3.5" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(300px,0.88fr)]">
        <div className="space-y-4">
          {hasOnlyCenterNode ? (
            <div className="rounded-[24px] border border-[#e8ebe4] bg-[#f7faf4] px-4 py-3 text-sm text-[#556357]">
              No connected neighborhood is stored for this address in Neo4j yet. The
              focal address is shown so you can still confirm the selected target and
              pivot into related pages.
            </div>
          ) : null}
          <GraphMap graph={effectiveGraph} depth={depth} />
        </div>

        <div className="space-y-4">
          {centerProfile ? (
            <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-[#1a271c]">Center node</div>
                  <div className="mt-1 text-sm text-[#8a948b]">
                    {centerProfile.entity_name || formatAddress(centerProfile.address, 8)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={riskTone(centerProfile.risk_level)}>
                    {centerProfile.risk_level || "observed"}
                  </Badge>
                  <Badge
                    className={
                      centerProfile.is_contract
                        ? "border-[#c8d3ee] bg-[#ebeffb] text-[#44507d]"
                        : "border-[#dbe3d8] bg-[#eef1ea] text-[#4d5a50]"
                    }
                  >
                    {centerProfile.is_contract ? "contract" : "wallet"}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-[#ecefe8] bg-[#f5f7f2] p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#95a094]">
                    Activity
                  </div>
                  <div className="mt-2 text-sm font-medium text-[#1c2a1d]">
                    {formatCount(centerProfile.total_count)} transactions
                  </div>
                  <div className="mt-1 text-xs text-[#76857a]">
                    Last seen {formatDateTime(centerProfile.last_seen)}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#ecefe8] bg-[#f5f7f2] p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#95a094]">
                    Balance
                  </div>
                  <div className="mt-2 text-sm font-medium text-[#1c2a1d]">
                    {formatWeiToEth(centerProfile.balance)}
                  </div>
                  <div className="mt-1 text-xs text-[#76857a]">
                    {formatCount(centerProfile.flag_count)} flags recorded
                  </div>
                </div>
              </div>

              {centerProfile.recent_transactions.length ? (
                <div className="mt-4 space-y-3">
                  {centerProfile.recent_transactions.slice(0, 3).map((tx) => (
                    <Link
                      key={tx.hash}
                      href={`/transactions/${encodeURIComponent(tx.hash)}`}
                      className="block rounded-[20px] border border-[#ecefe8] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#132118]">
                            {formatWeiToEth(tx.value)}
                          </div>
                          <div className="mt-1 text-xs text-[#76857a]">
                            {formatDateTime(tx.timestamp)}
                          </div>
                        </div>
                        <div className="font-mono text-xs text-[#607065]">
                          {formatAddress(tx.hash, 7)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="text-base font-semibold text-[#1a271c]">Node legend</div>
            <div className="mt-1 text-sm text-[#8a948b]">
              Click any visible node or label to open its account profile.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="success">wallet</Badge>
              <Badge className="border-[#c8d3ee] bg-[#ebeffb] text-[#44507d]">
                contract
              </Badge>
              <Badge className="border-[#c0d8ce] bg-[#e6f1eb] text-[#2f6c58]">
                hub
              </Badge>
              <Badge variant="danger">high risk</Badge>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[#1a271c]">Known hubs</div>
                <div className="mt-1 text-sm text-[#8a948b]">
                  High-degree entities in the current graph store.
                </div>
              </div>
              <Link
                href="/overview"
                className="text-xs font-medium text-[#869188] transition hover:text-[#2b6631]"
              >
                Dashboard
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {topHubs.length ? (
                topHubs.map((hub) => (
                  <Link
                    key={hub.address}
                    href={`/graph?address=${encodeURIComponent(hub.address)}&depth=2`}
                    className="block rounded-[22px] border border-[#ecefe8] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#132118]">
                          {hub.entity_name || formatAddress(hub.address, 7)}
                        </div>
                        <div className="mt-1 text-sm text-[#5d6a60]">
                          {hub.entity_type || (hub.is_contract ? "contract" : "wallet")}
                        </div>
                      </div>
                      <Badge className={riskTone(hub.risk_level)}>
                        {hub.risk_level || "observed"}
                      </Badge>
                    </div>
                    <div className="mt-3 text-xs text-[#76857a]">
                      degree {formatCount(hub.degree)} · in {formatCount(hub.incoming_count)} / out{" "}
                      {formatCount(hub.outgoing_count)}
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-[#6f7b72]">
                  No hub summaries are available right now.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="text-base font-semibold text-[#1a271c]">Path trace</div>
            <div className="mt-1 text-sm text-[#8a948b]">
              Request a destination above if you need a concrete bounded route.
            </div>

            <div className="mt-5 space-y-3">
              {trace ? (
                <>
                  <div className="rounded-[22px] border border-[#ecefe8] bg-[#f5f7f2] p-4">
                    <div className="text-sm text-[#556357]">
                      {trace.hops} hop{trace.hops === 1 ? "" : "s"} between{" "}
                      {formatAddress(trace.from)} and {formatAddress(trace.to)}.
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {trace.path.map((step) => (
                        <Badge key={step} variant="outline">
                          {formatAddress(step, 5)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {traceEdges.map((edge) => (
                    <div
                      key={`${edge.hash}:${edge.from}:${edge.to}`}
                      className="rounded-[22px] border border-[#ecefe8] bg-white p-4"
                    >
                      <div className="text-sm font-semibold text-[#132118]">
                        {formatAddress(edge.from)} → {formatAddress(edge.to)}
                      </div>
                      <div className="mt-2 text-sm text-[#5d6a60]">
                        {formatWeiToEth(edge.value)} · {formatDateTime(edge.timestamp)}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="rounded-[22px] border border-[#ecefe8] bg-[#f5f7f2] p-4 text-sm text-[#6f7b72]">
                  No target path requested yet. Add a destination address above when you need a concrete route rather than local neighborhood context.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
