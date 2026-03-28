"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Flame, Radar, RotateCcw } from "lucide-react";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { LineChart } from "@/components/dashboard/line-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clientApiFetch } from "@/lib/client-api";
import type {
  CircularFlow,
  ForensicFlag,
  NetworkMetricPoint,
  VelocityAlert,
} from "@/lib/types";
import {
  formatAddress,
  formatCount,
  formatDateTime,
  formatWeiToEth,
  riskTone,
} from "@/lib/utils";

const ANALYTICS_REFRESH_MS = 20_000;

type AlertsLiveSurfaceProps = {
  initialVelocityAlerts: VelocityAlert[];
  initialCircularFlows: CircularFlow[];
  initialRecentFlags: ForensicFlag[];
  initialNetworkMetrics: NetworkMetricPoint[];
};

export function AlertsLiveSurface({
  initialVelocityAlerts,
  initialCircularFlows,
  initialRecentFlags,
  initialNetworkMetrics,
}: AlertsLiveSurfaceProps) {
  const { snapshot } = useLiveSnapshot();
  const [velocityAlerts, setVelocityAlerts] = useState(initialVelocityAlerts);
  const [circularFlows, setCircularFlows] = useState(initialCircularFlows);
  const [recentFlags, setRecentFlags] = useState(initialRecentFlags);
  const [networkMetrics, setNetworkMetrics] = useState(initialNetworkMetrics);

  useEffect(() => {
    if (!snapshot || !Array.isArray(snapshot.recent_flags)) {
      return;
    }

    startTransition(() => {
      setRecentFlags(snapshot.recent_flags || []);
    });
  }, [snapshot]);

  const refreshAnalytics = useCallback(async () => {
    try {
      const [nextVelocityAlerts, nextCircularFlows, nextNetworkMetrics] =
        await Promise.all([
          clientApiFetch<VelocityAlert[]>("/alerts/velocity?limit=10"),
          clientApiFetch<CircularFlow[]>("/forensics/circular?limit=8"),
          clientApiFetch<NetworkMetricPoint[]>("/stats/network?hours=24&bucket=hour"),
        ]);

      startTransition(() => {
        setVelocityAlerts(nextVelocityAlerts);
        setCircularFlows(nextCircularFlows);
        setNetworkMetrics(nextNetworkMetrics);
      });
    } catch {
      // Preserve the last successful alert state if refresh fails.
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

  const highSeverityFlags = useMemo(
    () => recentFlags.filter((flag) => flag.severity === "high"),
    [recentFlags],
  );
  const chartValues = networkMetrics.map((point) => point.transaction_count);

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Alert Deck"
        title="Keep the spikes loud and the loops obvious."
        description="Alerts is the triage route: velocity anomalies, circular flow patterns, and the latest raised flags without the noise of the rest of the dashboard."
        actions={
          <Button asChild>
            <Link href="/graph">
              Pivot into graph tracing
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          eyebrow="Velocity alerts"
          value={formatCount(velocityAlerts.length)}
          description="Addresses whose current activity spikes well above their observed baseline."
          accent={<Radar className="size-6" />}
        />
        <MetricCard
          eyebrow="Circular flows"
          value={formatCount(circularFlows.length)}
          description="Loop-like movement patterns that deserve quick laundering or wash tracing review."
          accent={<RotateCcw className="size-6" />}
        />
        <MetricCard
          eyebrow="High severity"
          value={formatCount(highSeverityFlags.length)}
          description="Newest high-priority flags surfaced by the forensic engine."
          accent={<Flame className="size-6" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">Activity pressure</CardTitle>
            <CardDescription>
              Network-wide throughput trend for situational context while triaging spikes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[230px] rounded-[24px] border border-white/8 bg-black/20 p-4">
              <LineChart
                values={chartValues}
                stroke="rgb(251 191 36)"
                fill="rgba(251, 191, 36, 0.15)"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {networkMetrics.slice(-3).map((point) => (
                <div
                  key={point.bucket}
                  className="rounded-[22px] border border-white/8 bg-black/20 p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {formatDateTime(point.bucket)}
                  </div>
                  <div className="mt-1 text-sm text-slate-300/78">
                    {formatCount(point.transaction_count)} tx ·{" "}
                    {formatWeiToEth(point.total_value)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-cyan-100">
              <AlertTriangle className="size-5" />
              <CardTitle className="text-white">Velocity alerts</CardTitle>
            </div>
            <CardDescription>
              The addresses most worth opening as dossiers first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {velocityAlerts.length ? (
              velocityAlerts.map((alert) => (
                <Link
                  key={alert.address}
                  href={`/accounts/${encodeURIComponent(alert.address)}`}
                  className={`block rounded-[24px] border p-4 ${riskTone(alert.risk_level)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {alert.entity_name || formatAddress(alert.address, 7)}
                      </div>
                      <div className="mt-1 text-sm text-slate-100/84">
                        {alert.entity_type || (alert.is_contract ? "contract" : "wallet")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white">
                        {alert.spike_ratio.toFixed(1)}x
                      </div>
                      <div className="text-xs text-slate-100/75">spike ratio</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-100/78">
                    Current {formatCount(alert.current_count)} vs baseline{" "}
                    {alert.baseline_count.toFixed(1)} · {formatDateTime(alert.last_seen)}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-300/72">
                No velocity alerts are active right now.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">Circular flow patterns</CardTitle>
            <CardDescription>
              Short return paths and loops already surfaced by the graph engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {circularFlows.length ? (
              circularFlows.map((flow, index) => (
                <div
                  key={`${flow.path.join(":")}-${index}`}
                  className="rounded-[24px] border border-white/8 bg-black/20 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">
                      {flow.hops} hop{flow.hops === 1 ? "" : "s"}
                    </div>
                    <Badge variant="outline">
                      {formatCount(flow.transaction_hashes.length)} tx
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {flow.path.map((address, stepIndex) => (
                      <Link
                        key={`${flow.path.join(":")}:${stepIndex}:${address}`}
                        href={`/accounts/${encodeURIComponent(address)}`}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-100"
                      >
                        {formatAddress(address, 5)}
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-300/72">
                No circular flow alerts are currently available.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-white">Recent raised flags</CardTitle>
            <CardDescription>
              Freshly surfaced events ordered for immediate triage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentFlags.length ? (
              recentFlags.map((flag) => (
                <div
                  key={flag.id}
                  className={`rounded-[24px] border p-4 ${riskTone(flag.severity)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {flag.flag_type.replace(/_/g, " ")}
                      </div>
                      <div className="mt-1 text-sm text-slate-100/84">
                        {flag.description}
                      </div>
                    </div>
                    <Badge
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
                  <div className="mt-3 text-xs text-slate-100/78">
                    {formatAddress(flag.address, 7)} · {formatDateTime(flag.detected_at)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-300/72">
                No recent flags were returned by the backend.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
