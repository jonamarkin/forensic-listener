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
  ShieldCheck,
} from "lucide-react";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { LineChart } from "@/components/dashboard/line-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  "h-10 w-full rounded-[18px] border border-[#d7e2d0] bg-white px-3 text-sm text-[#132118] outline-none transition focus:border-[#97bf89] focus:ring-2 focus:ring-[#d5e8ce]";

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

function AlertMetric({
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
  const [queueFilter, setQueueFilter] = useState<"new" | "reviewing" | "escalated">("new");

  const caseOptions = useMemo(
    () =>
      [...initialCases].sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      ),
    [initialCases],
  );
  const visibleQueueFlags = useMemo(
    () =>
      recentFlags
        .filter((flag) => (flag.triage_status || "new") === queueFilter)
        .slice(0, 5),
    [queueFilter, recentFlags],
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
      const [nextVelocityAlerts, nextCircularFlows, nextNetworkMetrics] = await Promise.all([
        clientApiFetch<VelocityAlert[]>("/alerts/velocity?limit=10"),
        clientApiFetch<CircularFlow[]>("/forensics/circular?limit=8"),
        clientApiFetch<NetworkMetricPoint[]>("/stats/network?hours=24&bucket=hour"),
      ]);

      startTransition(() => {
        setVelocityAlerts(nextVelocityAlerts);
        setCircularFlows(nextCircularFlows);
        setNetworkMetrics(nextNetworkMetrics);
      });
    } catch {}
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
  const reviewingCount = useMemo(
    () => recentFlags.filter((flag) => (flag.triage_status || "new") === "reviewing").length,
    [recentFlags],
  );
  const chartValues = networkMetrics.map((point) => point.transaction_count);
  const latestNetworkPoint = networkMetrics.at(-1);

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
    <div className="space-y-5 pb-4 lg:space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.55rem] font-semibold tracking-tight text-[#162317] lg:text-[1.8rem]">
            Alert Triage Desk
          </h1>
          <p className="mt-1 text-sm text-[#8a948b]">
            Focus on the signals that matter, link them to cases, and move decisions forward quickly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" className="rounded-xl">
            <Link href="/cases">
              Open cases
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild className="rounded-xl">
            <Link href="/graph">
              Open graph
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <AlertMetric
          title="Velocity alerts"
          value={formatCount(velocityAlerts.length)}
          detail="Addresses whose activity is sharply above baseline."
          icon={<Radar className="size-3.5" />}
        />
        <AlertMetric
          title="Circular paths"
          value={formatCount(circularFlows.length)}
          detail="Loop-shaped routes surfaced by Neo4j."
          icon={<RotateCcw className="size-3.5" />}
        />
        <AlertMetric
          title="High severity"
          value={formatCount(highSeverityFlags.length)}
          detail={`${formatCount(reviewingCount)} currently under analyst review.`}
          icon={<Flame className="size-3.5" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.58fr)_minmax(300px,0.9fr)]">
        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-base font-semibold text-[#1a271c]">Alert Pressure</div>
              <div className="mt-1 text-sm text-[#8a948b]">
                Network throughput context while you review flagged activity.
              </div>
            </div>
            <div className="rounded-2xl border border-[#edf0e9] bg-[#f5f7f2] px-4 py-3 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#97a198]">
                Latest hour
              </div>
              <div className="mt-1 text-lg font-semibold text-[#162317]">
                {formatCount(latestNetworkPoint?.transaction_count || 0)} tx
              </div>
              <div className="text-sm text-[#69766b]">
                {formatWeiToEth(latestNetworkPoint?.total_value || "0")}
              </div>
            </div>
          </div>

          <div className="mt-5 h-[240px] rounded-[24px] border border-[#e8ebe4] bg-[#f5f7f2] p-4">
            <LineChart
              values={chartValues}
              stroke="rgb(196 119 40)"
              fill="rgba(244, 234, 208, 0.7)"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {networkMetrics.slice(-3).map((point) => (
              <div
                key={point.bucket}
                className="rounded-[20px] border border-[#ecefe8] bg-white p-4"
              >
                <div className="text-sm font-semibold text-[#162317]">
                  {formatDateTime(point.bucket)}
                </div>
                <div className="mt-1 text-sm text-[#69766b]">
                  {formatCount(point.transaction_count)} tx
                </div>
                <div className="mt-1 text-sm text-[#69766b]">
                  {formatCount(point.unique_addresses)} active addresses
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[#1a271c]">Priority dossiers</div>
              <div className="mt-1 text-sm text-[#8a948b]">
                Open these first if you need immediate context.
              </div>
            </div>
            <Link
              href="/graph"
              className="text-xs font-medium text-[#869188] transition hover:text-[#2b6631]"
            >
              View more
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {velocityAlerts.slice(0, 4).length ? (
              velocityAlerts.slice(0, 4).map((alert) => (
                <Link
                  key={alert.address}
                  href={`/accounts/${encodeURIComponent(alert.address)}`}
                  className={`block rounded-[24px] border p-4 transition hover:shadow-[0_10px_25px_rgba(28,41,26,0.04)] ${riskTone(alert.risk_level)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[#132118]">
                        {alert.entity_name || formatAddress(alert.address, 7)}
                      </div>
                      <div className="mt-1 text-sm text-[#5d6a60]">
                        {alert.entity_type || (alert.is_contract ? "contract" : "wallet")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-[#132118]">
                        {alert.spike_ratio.toFixed(1)}x
                      </div>
                      <div className="text-xs text-[#69766b]">spike ratio</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-[#69766b]">
                    Current {formatCount(alert.current_count)} vs baseline{" "}
                    {alert.baseline_count.toFixed(1)}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-[#6f7b72]">
                No velocity alerts are active right now.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.95fr)]">
        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-base font-semibold text-[#1a271c]">Triage queue</div>
              <div className="mt-1 text-sm text-[#8a948b]">
                Review the newest flagged events.
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[#ecefe8] bg-[#f8f9f5] p-1 text-[11px] font-medium text-[#627165]">
              {[
                { label: "New", value: "new" as const },
                { label: "Reviewing", value: "reviewing" as const },
                { label: "Escalated", value: "escalated" as const },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setQueueFilter(item.value)}
                  className={`rounded-lg px-2.5 py-1.5 transition ${
                    queueFilter === item.value
                      ? "bg-white text-[#1f2c20] shadow-sm"
                      : "hover:bg-white/70"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <span className="ml-1 rounded-lg px-2.5 py-1.5 text-[#8a948b]">
                {visibleQueueFlags.length} shown
              </span>
            </div>
          </div>

          {statusMessage ? (
            <p className="mt-4 rounded-[18px] border border-[#b8d6ad] bg-[#edf4e8] px-3 py-2 text-sm text-[#2b6631]">
              {statusMessage}
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            {visibleQueueFlags.length ? (
              visibleQueueFlags.map((flag) => {
                const draft = triageDrafts[flag.id] ?? buildTriageDraft(flag);
                const isSaving = savingFlagID === flag.id;

                return (
                  <div
                    key={flag.id}
                    className={`rounded-[24px] border p-4 ${riskTone(flag.severity)}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#132118]">
                          {flag.flag_type.replace(/_/g, " ")}
                        </div>
                        <div className="mt-1 text-sm text-[#5d6a60]">
                          {flag.description}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={triageTone(flag.triage_status)}>
                          {flag.triage_status || "new"}
                        </Badge>
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
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#69766b]">
                      <span>{formatAddress(flag.address, 7)}</span>
                      <span>{formatDateTime(flag.detected_at)}</span>
                      {flag.tx_hash ? (
                        <Link
                          href={`/transactions/${encodeURIComponent(flag.tx_hash)}`}
                          className="rounded-full border border-[#dbe3d8] bg-white/80 px-3 py-1 transition hover:bg-white"
                        >
                          {formatAddress(flag.tx_hash, 7)}
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3 rounded-[20px] border border-[#dbe3d8] bg-white/78 p-4">
                      <div className="grid gap-3 lg:grid-cols-[0.9fr_1fr]">
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

                      <div className="grid gap-3 lg:grid-cols-[0.9fr_1fr]">
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
                        <div className="text-sm text-[#5d6a60]">
                          {flag.why_flagged ? `Why flagged: ${flag.why_flagged}` : "Link this event to an active case or leave it standalone."}
                        </div>
                      </div>

                      <Textarea
                        value={draft.analyst_note}
                        onChange={(event) =>
                          updateDraft(flag.id, { analyst_note: event.target.value })
                        }
                        placeholder="Analyst note: relevance, next step, or handoff."
                        className="min-h-[94px]"
                      />

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
              <p className="text-sm text-[#6f7b72]">
                No recent flags were returned by the backend.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[#1a271c]">Circular patterns</div>
                <div className="mt-1 text-sm text-[#8a948b]">
                  Short loops worth validating in the graph.
                </div>
              </div>
              <Link
                href="/graph"
                className="text-xs font-medium text-[#869188] transition hover:text-[#2b6631]"
              >
                Open graph
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {circularFlows.slice(0, 4).length ? (
                circularFlows.slice(0, 4).map((flow, index) => (
                  <div
                    key={`${flow.path.join(":")}-${index}`}
                    className="rounded-[22px] border border-[#ecefe8] bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#132118]">
                        {flow.hops} hop{flow.hops === 1 ? "" : "s"}
                      </div>
                      <Badge variant="outline">
                        {formatCount(flow.transaction_hashes.length)} tx
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {flow.path.slice(0, 4).map((address, stepIndex) => (
                        <Link
                          key={`${flow.path.join(":")}:${stepIndex}:${address}`}
                          href={`/accounts/${encodeURIComponent(address)}`}
                          className="rounded-full border border-[#dbe3d8] bg-[#f4f7ef] px-3 py-1 text-xs text-[#3e4d42]"
                        >
                          {formatAddress(address, 4)}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#6f7b72]">
                  No circular flow alerts are currently available.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="flex items-center gap-2 text-[#2b6631]">
              <ShieldCheck className="size-5" />
              <div className="text-base font-semibold text-[#1a271c]">Analyst handoff</div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-[22px] border border-[#ecefe8] bg-[#f5f7f2] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#95a094]">
                  Current posture
                </div>
                <div className="mt-2 text-sm font-medium text-[#1c2a1d]">
                  {highSeverityFlags[0]?.next_action ||
                    "Escalate the newest high-severity flag, or attach it to an active case for follow-up."}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-[#ecefe8] bg-white p-4">
                  <div className="text-sm text-[#7e887f]">Reviewing now</div>
                  <div className="mt-2 text-2xl font-semibold text-[#162317]">
                    {formatCount(reviewingCount)}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#ecefe8] bg-white p-4">
                  <div className="text-sm text-[#7e887f]">Open cases</div>
                  <div className="mt-2 text-2xl font-semibold text-[#162317]">
                    {formatCount(caseOptions.length)}
                  </div>
                </div>
              </div>

              <div className="text-sm text-[#69766b]">
                Review signals here, then open the related case, graph, or dossier.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
