import Link from "next/link";
import { ArrowRight, Binary, Compass, Route } from "lucide-react";

import { GraphMap } from "@/components/dashboard/graph-map";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { maybeApiFetch } from "@/lib/api";
import type { AddressGraph, AddressTrace, HubSummary } from "@/lib/types";
import { formatAddress, formatCount, formatDateTime, formatWeiToEth, riskTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
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

  const flaggedNodes = graph?.nodes.filter((node) => node.risk_level === "high").length ?? 0;
  const contractNodes = graph?.nodes.filter((node) => node.is_contract).length ?? 0;

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Neo4j Flow Canvas"
        title="Trace value movement with room to think."
        description="Search one address, set a hop depth, and keep pathfinding, hubs, and address pivots in one focused graph route instead of burying them under every other widget."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-white">Trace controls</CardTitle>
          <CardDescription>
            Adjust graph scope and optionally request a concrete return or destination path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/graph" className="grid gap-3 lg:grid-cols-[1.3fr_0.4fr_1fr_auto]">
            <Input
              name="address"
              defaultValue={address}
              placeholder="Start address"
            />
            <select
              name="depth"
              defaultValue={String(depth)}
              className="flex h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-slate-50 outline-none focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
            >
              {[1, 2, 3, 4].map((option) => (
                <option key={option} value={option} className="bg-slate-950">
                  {option} hop{option > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <Input
              name="to"
              defaultValue={target}
              placeholder="Optional target address for trace path"
            />
            <Button type="submit">
              Render
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          eyebrow="Nodes"
          value={formatCount(graph?.nodes.length ?? 0)}
          description="Addresses and contracts currently visible inside the selected trace boundary."
          accent={<Binary className="size-6" />}
        />
        <MetricCard
          eyebrow="Contracts"
          value={formatCount(contractNodes)}
          description="Contracts in the active path neighborhood, useful for quick code pivots."
          accent={<Compass className="size-6" />}
        />
        <MetricCard
          eyebrow="High Risk"
          value={formatCount(flaggedNodes)}
          description="Nodes already carrying a high-risk label in the active graph scope."
          accent={<Route className="size-6" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.55fr_0.95fr]">
        <GraphMap graph={graph} depth={depth} />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-white">Graph reading guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300/80">
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">wallet</Badge>
                <Badge className="bg-indigo-500/15 text-indigo-100 border-indigo-400/30">
                  contract
                </Badge>
                <Badge className="bg-cyan-500/15 text-cyan-100 border-cyan-400/30">
                  hub
                </Badge>
                <Badge variant="danger">high risk</Badge>
              </div>
              <p>
                Click a node label to pivot into the account dossier. Change the
                graph center with the trace controls above when you want to keep
                following the money.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-white">Known hubs</CardTitle>
              <CardDescription>
                A fast shortlist of entities worth expanding first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {hubs.map((hub) => (
                <Link
                  key={hub.address}
                  href={`/graph?address=${encodeURIComponent(hub.address)}&depth=2`}
                  className="block rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {hub.entity_name || formatAddress(hub.address, 7)}
                      </div>
                      <div className="mt-1 text-sm text-slate-300/76">
                        {hub.entity_type || (hub.is_contract ? "contract" : "wallet")}
                      </div>
                    </div>
                    <Badge className={riskTone(hub.risk_level)}>
                      {hub.risk_level || "observed"}
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-slate-300/72">
                    degree {formatCount(hub.degree)} · in {formatCount(hub.incoming_count)} / out{" "}
                    {formatCount(hub.outgoing_count)}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-white">Path trace</CardTitle>
              <CardDescription>
                When a target is supplied, the shortest bounded path appears here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {trace ? (
                <>
                  <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="text-sm text-slate-300/78">
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
                  {trace.edges.map((edge) => (
                    <div
                      key={`${edge.hash}:${edge.from}:${edge.to}`}
                      className="rounded-[22px] border border-white/8 bg-black/20 p-4"
                    >
                      <div className="text-sm font-semibold text-white">
                        {formatAddress(edge.from)} → {formatAddress(edge.to)}
                      </div>
                      <div className="mt-2 text-sm text-slate-300/78">
                        {formatWeiToEth(edge.value)} · {formatDateTime(edge.timestamp)}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-slate-300/72">
                  No target path requested yet. Add a destination address above
                  when you want a concrete route, not just the local graph.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
