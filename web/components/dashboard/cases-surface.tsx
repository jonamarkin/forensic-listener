"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Filter,
  FolderPlus,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  "h-10 w-full rounded-[18px] border border-[#d7e2d0] bg-white px-3 text-sm text-[#132118] outline-none transition focus:border-[#97bf89] focus:ring-2 focus:ring-[#d5e8ce]";

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

function CaseMetric({
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
    <div className="space-y-5 pb-4 lg:space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.55rem] font-semibold tracking-tight text-[#162317] lg:text-[1.8rem]">
            Investigation Cases
          </h1>
          <p className="mt-1 text-sm text-[#8a948b]">
            Preserve decisions, assign ownership, and turn promising leads into a structured record.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" className="rounded-xl">
            <Link href="/alerts">
              Open alerts
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
        <CaseMetric
          title="Open cases"
          value={formatCount(openCases)}
          detail="Active investigations still moving through review."
          icon={<BriefcaseBusiness className="size-3.5" />}
        />
        <CaseMetric
          title="Escalated"
          value={formatCount(escalatedCases)}
          detail="Cases marked urgent or high concern."
          icon={<ShieldAlert className="size-3.5" />}
        />
        <CaseMetric
          title="Open flags"
          value={formatCount(openFlags)}
          detail="Unresolved triage items linked into the visible case queue."
          icon={<FolderPlus className="size-3.5" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.92fr)]">
        <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-base font-semibold text-[#1a271c]">Case queue</div>
              <div className="mt-1 text-sm text-[#8a948b]">
                Saved investigations ordered by the most recent movement.
              </div>
            </div>
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-xl border border-[#ecefe8] bg-[#f8f9f5] px-3 py-2 text-xs font-medium text-[#627165] transition hover:bg-white"
                onClick={() => void refreshCases(filter)}
              >
                <Filter className="size-3" />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {cases.length ? (
              cases.map((item) => (
                <Link
                  key={item.id}
                  href={`/cases/${item.id}`}
                  className="block rounded-[24px] border border-[#ecefe8] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#132118]">
                        {item.title}
                      </div>
                      <div className="mt-1 text-sm text-[#5d6a60]">
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
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#76857a]">
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
              <p className="text-sm text-[#6f7b72]">
                No investigation cases match the current filter.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="text-base font-semibold text-[#1a271c]">Open a new case</div>
            <div className="mt-1 text-sm text-[#8a948b]">
              Start a structured investigation when an alert thread or address cluster deserves to be preserved.
            </div>

            <form className="mt-5 space-y-3" onSubmit={createCase}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Case title"
              />
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Working hypothesis, concern, or investigation scope."
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
              <Button type="submit" disabled={isPending} className="rounded-2xl">
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
              <p className="mt-4 rounded-[18px] border border-[#b8d6ad] bg-[#edf4e8] px-3 py-2 text-sm text-[#2b6631]">
                {statusMessage}
              </p>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
            <div className="text-base font-semibold text-[#1a271c]">Case discipline</div>
            <div className="mt-4 space-y-3 text-sm text-[#5d6a60]">
              <p>
                Keep the list short by opening a case only when you expect ongoing follow-up, ownership, or evidence capture.
              </p>
              <p>
                Use alerts for fast triage and this page for investigations that need to persist beyond one review session.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
