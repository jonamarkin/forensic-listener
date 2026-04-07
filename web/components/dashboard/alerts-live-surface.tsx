"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  LoaderCircle,
  Radar,
  RotateCcw,
} from "lucide-react";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { LineChart } from "@/components/dashboard/line-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clientApiFetch } from "@/lib/client-api";
import type {
  CircularFlow,
  ForensicFlag,
  InvestigationCaseSummary,
  NetworkMetricPoint,
  VelocityAlert,
} from "@/lib/types";
import {
  formatAddress,
  formatCount,
  formatDateTime,
  formatWeiToEth,
  riskTone,
  triageTone,
} from "@/lib/utils";

const ANALYTICS_REFRESH_MS = 20_000;
const selectClassName =
  "h-10 w-full rounded-[18px] border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/35 focus:ring-2 focus:ring-cyan-400/15";

type AlertsLiveSurfaceProps = {
  initialVelocityAlerts: VelocityAlert[];
  initialCircularFlows: CircularFlow[];
  initialRecentFlags: ForensicFlag[];
  initialNetworkMetrics: NetworkMetricPoint[];
  initialCases: InvestigationCaseSummary[];
};

type TriageDraft = {
  status: string;
  assignee: string;
  analyst_note: string;
  case_id: string;
};

function buildTriageDraft(flag: ForensicFlag): TriageDraft {
  return {
    status: flag.triage_status || "new",
    assignee: flag.assignee || "",
    analyst_note: flag.analyst_note || "",
    case_id: flag.case_id ? String(flag.case_id) : "",
  };
}

export function AlertsLiveSurface({
  initialVelocityAlerts,
  initialCircularFlows,
  initialRecentFlags,
  initialNetworkMetrics,
  initialCases,
}: AlertsLiveSurfaceProps) {
  const { snapshot } = useLiveSnapshot();
  const [velocityAlerts, setVelocityAlerts] = useState(initialVelocityAlerts);
  const [circularFlows, setCircularFlows] = useState(initialCircularFlows);
  const [recentFlags, setRecentFlags] = useState(initialRecentFlags);
  const [networkMetrics, setNetworkMetrics] = useState(initialNetworkMetrics);
  const [triageDrafts, setTriageDrafts] = useState<Record<number, TriageDraft>>(() =>
    Object.fromEntries(initialRecentFlags.map((flag) => [flag.id, buildTriageDraft(flag)])),
  );
  const [savingFlagID, setSavingFlagID] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const caseOptions = useMemo(
    () =>
      [...initialCases].sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      ),
    [initialCases],
  );

  useEffect(() => {
    if (!snapshot || !Array.isArray(snapshot.recent_flags)) {
      return;
    }

    startTransition(() => {
      const nextFlags = snapshot.recent_flags || [];
      setRecentFlags(nextFlags);
      setTriageDrafts((current) => {
        const nextDrafts: Record<number, TriageDraft> = {};
        for (const flag of nextFlags) {
          nextDrafts[flag.id] = current[flag.id] ?? buildTriageDraft(flag);
        }
        return nextDrafts;
      });
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

  function updateDraft(flagID: number, patch: Partial<TriageDraft>) {
    setTriageDrafts((current) => ({
      ...current,
      [flagID]: {
        ...(current[flagID] ?? {
          status: "new",
          assignee: "",
          analyst_note: "",
          case_id: "",
        }),
        ...patch,
      },
    }));
  }

  async function submitTriage(flagID: number, nextStatus?: string) {
    const draft = triageDrafts[flagID] ?? {
      status: "new",
      assignee: "",
      analyst_note: "",
      case_id: "",
    };

    setSavingFlagID(flagID);
    setStatusMessage("");
    try {
      const updated = await clientApiFetch<ForensicFlag>(`/flags/${flagID}/triage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextStatus || draft.status,
          assignee: draft.assignee.trim(),
          analyst_note: draft.analyst_note.trim(),
          case_id: draft.case_id ? Number(draft.case_id) : null,
        }),
      });

      startTransition(() => {
        setRecentFlags((current) =>
          current.map((flag) => (flag.id === flagID ? updated : flag)),
        );
        setTriageDrafts((current) => ({
          ...current,
          [flagID]: buildTriageDraft(updated),
        }));
      });
      setStatusMessage("Alert triage updated.");
    } catch {
      setStatusMessage("Unable to update the selected alert right now.");
    } finally {
      setSavingFlagID(null);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Alerts"
        title="Triage suspicious activity"
        description="Review raised flags, inspect network context, and preserve analyst decisions in linked cases."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/cases">
                Open cases
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/graph">
                Open graph
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          eyebrow="Velocity alerts"
          value={formatCount(velocityAlerts.length)}
          description="Addresses whose current activity is well above baseline."
          accent={<Radar className="size-6" />}
        />
        <MetricCard
          eyebrow="Circular flows"
          value={formatCount(circularFlows.length)}
          description="Loop-like movement patterns that deserve quick review."
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
              Network-wide throughput context while triaging spikes.
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
              Addresses most worth opening as dossiers first.
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
              Short return paths and loops surfaced by the graph engine.
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
          <CardContent className="space-y-4">
            {statusMessage ? (
              <p className="rounded-[18px] border border-cyan-300/20 bg-cyan-400/8 px-3 py-2 text-sm text-cyan-100">
                {statusMessage}
              </p>
            ) : null}

            {recentFlags.length ? (
              recentFlags.map((flag) => {
                const draft =
                  triageDrafts[flag.id] ?? buildTriageDraft(flag);
                const isSaving = savingFlagID === flag.id;

                return (
                  <div
                    key={flag.id}
                    className={`rounded-[24px] border p-4 ${riskTone(flag.severity)}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {flag.flag_type.replace(/_/g, " ")}
                        </div>
                        <div className="mt-1 text-sm text-slate-100/84">
                          {flag.description}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                        <Badge className={triageTone(flag.triage_status)}>
                          {flag.triage_status || "new"}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-100/78">
                      <span>{formatAddress(flag.address, 7)}</span>
                      <span>{formatDateTime(flag.detected_at)}</span>
                      {flag.tx_hash ? (
                        <Link
                          href={`/transactions/${encodeURIComponent(flag.tx_hash)}`}
                          className="rounded-full border border-white/12 bg-white/8 px-3 py-1 transition hover:bg-white/12"
                        >
                          {formatAddress(flag.tx_hash, 7)}
                        </Link>
                      ) : null}
                      {flag.case_id && flag.case_title ? (
                        <Link
                          href={`/cases/${flag.case_id}`}
                          className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-cyan-100 transition hover:bg-white/12"
                        >
                          {flag.case_title}
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3 rounded-[22px] border border-white/10 bg-black/20 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/76">
                        Review
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <select
                          className={selectClassName}
                          value={draft.status}
                          onChange={(event) =>
                            updateDraft(flag.id, { status: event.target.value })
                          }
                        >
                          <option value="new">New</option>
                          <option value="reviewing">Reviewing</option>
                          <option value="escalated">Escalated</option>
                          <option value="dismissed">Dismissed</option>
                          <option value="resolved">Resolved</option>
                        </select>
                        <Input
                          value={draft.assignee}
                          onChange={(event) =>
                            updateDraft(flag.id, { assignee: event.target.value })
                          }
                          placeholder="Assign analyst"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <select
                          className={selectClassName}
                          value={draft.case_id}
                          onChange={(event) =>
                            updateDraft(flag.id, { case_id: event.target.value })
                          }
                        >
                          <option value="">No linked case</option>
                          {caseOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                        </select>
                        <div className="text-xs text-slate-300/72 sm:self-center">
                          {caseOptions.length
                            ? "Link this flag into an active case."
                            : "Create a case first if you want to preserve this alert in an investigation."}
                        </div>
                      </div>

                      <Textarea
                        value={draft.analyst_note}
                        onChange={(event) =>
                          updateDraft(flag.id, {
                            analyst_note: event.target.value,
                          })
                        }
                        placeholder="Analyst note: relevance, follow-up, and next step."
                      />

                      <div className="space-y-1 text-sm text-slate-100/80">
                        {flag.why_flagged ? <p>Why flagged: {flag.why_flagged}</p> : null}
                        {flag.trigger_logic ? <p>Trigger logic: {flag.trigger_logic}</p> : null}
                        {flag.provenance ? <p>Provenance: {flag.provenance}</p> : null}
                        {flag.next_action ? <p>Next action: {flag.next_action}</p> : null}
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          type="button"
                          onClick={() => void submitTriage(flag.id)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <>
                              <LoaderCircle className="size-4 animate-spin" />
                              Saving
                            </>
                          ) : (
                            "Save review"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void submitTriage(flag.id, "escalated")}
                          disabled={isSaving}
                        >
                          Escalate
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void submitTriage(flag.id, "dismissed")}
                          disabled={isSaving}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
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
