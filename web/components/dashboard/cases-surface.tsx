"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  FolderPlus,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clientApiFetch } from "@/lib/client-api";
import type { InvestigationCaseSummary } from "@/lib/types";
import {
  caseStatusTone,
  formatCount,
  formatDateTime,
  priorityTone,
} from "@/lib/utils";

const selectClassName =
  "h-10 w-full rounded-[18px] border border-white/10 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/40";

type CasesSurfaceProps = {
  initialCases: InvestigationCaseSummary[];
};

function mergeCaseSummaries(
  current: InvestigationCaseSummary[],
  incoming: InvestigationCaseSummary[],
) {
  const byID = new Map<number, InvestigationCaseSummary>();
  for (const item of [...current, ...incoming]) {
    byID.set(item.id, item);
  }

  return [...byID.values()].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
}

export function CasesSurface({ initialCases }: CasesSurfaceProps) {
  const [cases, setCases] = useState(initialCases);
  const [filter, setFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("medium");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const refreshCases = useCallback(async (nextFilter: string) => {
    const statusQuery =
      nextFilter === "all" ? "" : `&status=${encodeURIComponent(nextFilter)}`;
    const nextCases = await clientApiFetch<InvestigationCaseSummary[]>(
      `/cases?limit=24${statusQuery}`,
    );
    setCases(nextCases);
  }, []);

  useEffect(() => {
    void refreshCases(filter);
  }, [filter, refreshCases]);

  const openCases = useMemo(
    () => cases.filter((item) => item.status === "open").length,
    [cases],
  );
  const escalatedCases = useMemo(
    () => cases.filter((item) => item.status === "escalated").length,
    [cases],
  );
  const openFlags = useMemo(
    () => cases.reduce((sum, item) => sum + item.open_flag_count, 0),
    [cases],
  );

  function createCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setStatusMessage("Give the case a title first.");
      return;
    }

    startTransition(async () => {
      try {
        setStatusMessage("");
        const created = await clientApiFetch<InvestigationCaseSummary>("/cases", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            summary: summary.trim(),
            owner: owner.trim(),
            priority,
          }),
        });

        setCases((current) => mergeCaseSummaries(current, [created]));
        setTitle("");
        setSummary("");
        setOwner("");
        setPriority("medium");
        setStatusMessage("Investigation case opened.");
        await refreshCases(filter);
      } catch {
        setStatusMessage("Unable to open a new case right now.");
      }
    });
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Cases"
        title="Run investigations as saved work, not memory."
        description="Cases gather addresses, linked alerts, ownership, and status into one investigative workspace. This is where the investigator role becomes durable instead of session-based."
        actions={
          <Button asChild>
            <Link href="/alerts">
              Review alert queue
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          eyebrow="Open cases"
          value={formatCount(openCases)}
          description="Cases still being investigated or actively worked."
          accent={<BriefcaseBusiness className="size-6" />}
        />
        <MetricCard
          eyebrow="Escalated"
          value={formatCount(escalatedCases)}
          description="Investigations marked high concern or requiring urgent follow-up."
          accent={<ShieldAlert className="size-6" />}
        />
        <MetricCard
          eyebrow="Open flags"
          value={formatCount(openFlags)}
          description="Triage items still unresolved across the visible case queue."
          accent={<FolderPlus className="size-6" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-white">Case queue</CardTitle>
                <CardDescription>
                  Saved investigations with counts for linked addresses and unresolved flags.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  className={selectClassName}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="escalated">Escalated</option>
                  <option value="closed">Closed</option>
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void refreshCases(filter)}
                  disabled={isPending}
                >
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {cases.length ? (
              cases.map((item) => (
                <Link
                  key={item.id}
                  href={`/cases/${item.id}`}
                  className="block rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {item.title}
                      </div>
                      <div className="mt-1 text-sm text-slate-300/76">
                        {item.summary || "No case summary recorded yet."}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={caseStatusTone(item.status)}>
                        {item.status}
                      </Badge>
                      <Badge className={priorityTone(item.priority)}>
                        {item.priority}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>
                      {item.address_count} address{item.address_count === 1 ? "" : "es"}
                    </span>
                    <span>
                      {item.open_flag_count} open flag
                      {item.open_flag_count === 1 ? "" : "s"}
                    </span>
                    <span>Owner {item.owner || "investigator"}</span>
                    <span>{formatDateTime(item.updated_at)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-300/72">
                No investigation cases match the current filter.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-white">Open a new case</CardTitle>
            <CardDescription>
              Use this when an address cluster or alert thread deserves a saved investigation track.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-3" onSubmit={createCase}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Case title"
              />
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Working hypothesis, concern, or investigative scope."
              />
              <Input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="Case owner"
              />
              <select
                className={selectClassName}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
                <option value="critical">Critical priority</option>
              </select>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Opening
                  </>
                ) : (
                  "Open case"
                )}
              </Button>
            </form>

            {statusMessage ? (
              <p className="rounded-[18px] border border-cyan-300/20 bg-cyan-400/8 px-3 py-2 text-sm text-cyan-100">
                {statusMessage}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
