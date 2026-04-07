"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle, NotebookPen, Radar, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clientApiFetch } from "@/lib/client-api";
import type { InvestigationCaseDetail, InvestigationCaseSummary } from "@/lib/types";
import {
  caseStatusTone,
  entityTone,
  formatAddress,
  formatDateTime,
  priorityTone,
  riskTone,
  triageTone,
} from "@/lib/utils";

const selectClassName =
  "h-10 w-full rounded-[18px] border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/35 focus:ring-2 focus:ring-cyan-400/15";

type CaseDetailSurfaceProps = {
  initialCase: InvestigationCaseDetail;
};

function applySummary(
  detail: InvestigationCaseDetail,
  summary: InvestigationCaseSummary,
): InvestigationCaseDetail {
  return {
    ...detail,
    ...summary,
  };
}

export function CaseDetailSurface({ initialCase }: CaseDetailSurfaceProps) {
  const [detail, setDetail] = useState(initialCase);
  const [title, setTitle] = useState(initialCase.title);
  const [summary, setSummary] = useState(initialCase.summary);
  const [owner, setOwner] = useState(initialCase.owner);
  const [status, setStatus] = useState(initialCase.status);
  const [priority, setPriority] = useState(initialCase.priority);
  const [address, setAddress] = useState("");
  const [role, setRole] = useState("subject");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setFeedback("Case title must not be empty.");
      return;
    }

    startTransition(async () => {
      try {
        setFeedback("");
        const updated = await clientApiFetch<InvestigationCaseSummary>(
          `/cases/${detail.id}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: title.trim(),
              summary: summary.trim(),
              owner: owner.trim(),
              status,
              priority,
            }),
          },
        );

        setDetail((current) => applySummary(current, updated));
        setFeedback("Case metadata updated.");
      } catch {
        setFeedback("Unable to update this case right now.");
      }
    });
  }

  function addAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address.trim()) {
      setFeedback("Address must not be empty.");
      return;
    }

    startTransition(async () => {
      try {
        setFeedback("");
        await clientApiFetch(`/cases/${detail.id}/addresses`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address: address.trim(),
            role,
            note: note.trim(),
          }),
        });

        const refreshed = await clientApiFetch<InvestigationCaseDetail>(
          `/cases/${detail.id}`,
        );
        setDetail(refreshed);
        setTitle(refreshed.title);
        setSummary(refreshed.summary);
        setOwner(refreshed.owner);
        setStatus(refreshed.status);
        setPriority(refreshed.priority);
        setAddress("");
        setRole("subject");
        setNote("");
        setFeedback("Address attached to the case.");
      } catch {
        setFeedback("Unable to attach the address right now.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Status
            </div>
            <div className="mt-3">
              <Badge className={caseStatusTone(detail.status)}>{detail.status}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Priority
            </div>
            <div className="mt-3">
              <Badge className={priorityTone(detail.priority)}>{detail.priority}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Linked addresses
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {detail.address_count}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Open flags
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {detail.open_flag_count}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-cyan-100">
              <NotebookPen className="size-5" />
              <CardTitle className="text-white">Case command</CardTitle>
            </div>
            <CardDescription>
              Control ownership, priority, and status so the investigation can move through a real workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-3" onSubmit={saveCase}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Case title"
              />
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Working hypothesis or current investigative framing."
              />
              <Input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="Case owner"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClassName}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="open">Open</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="escalated">Escalated</option>
                  <option value="closed">Closed</option>
                </select>
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
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save case"
                )}
              </Button>
            </form>

            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-slate-300/78">
              Created {formatDateTime(detail.created_at)} · Updated{" "}
              {formatDateTime(detail.updated_at)} · Owner {detail.owner || "investigator"}
            </div>

            {feedback ? (
              <p className="rounded-[18px] border border-cyan-300/20 bg-cyan-400/8 px-3 py-2 text-sm text-cyan-100">
                {feedback}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-cyan-100">
              <Radar className="size-5" />
              <CardTitle className="text-white">Linked addresses</CardTitle>
            </div>
            <CardDescription>
              Save the cluster under investigation so tracing and notes become persistent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-3" onSubmit={addAddress}>
              <Input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="0x address to add into the case"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClassName}
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                >
                  <option value="subject">Subject</option>
                  <option value="counterparty">Counterparty</option>
                  <option value="watch">Watch</option>
                  <option value="entity">Entity</option>
                  <option value="contract">Contract</option>
                </select>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Why this address belongs in the case."
                />
              </div>
              <Button type="submit" variant="secondary" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Linking
                  </>
                ) : (
                  "Attach address"
                )}
              </Button>
            </form>

            <div className="space-y-3">
              {detail.addresses.length ? (
                detail.addresses.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/accounts/${encodeURIComponent(entry.address)}`}
                    className="block rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {entry.entity_name || formatAddress(entry.address, 8)}
                        </div>
                        <div className="mt-1 text-sm text-slate-300/76">
                          {entry.address}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={entityTone(entry.entity_type)}>
                          {entry.entity_type || (entry.is_contract ? "contract" : "wallet")}
                        </Badge>
                        <Badge className={riskTone(entry.risk_level)}>
                          {entry.risk_level || "observed"}
                        </Badge>
                        <Badge variant="outline">{entry.role}</Badge>
                      </div>
                    </div>
                    {entry.note ? (
                      <p className="mt-3 text-sm text-slate-300/76">{entry.note}</p>
                    ) : null}
                    <div className="mt-3 text-xs text-slate-400">
                      Added {formatDateTime(entry.added_at)}
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-300/72">
                  No addresses have been attached to this case yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-cyan-100">
            <ShieldAlert className="size-5" />
            <CardTitle className="text-white">Linked flags</CardTitle>
          </div>
          <CardDescription>
            Flags already triaged into this case, ready for follow-up or closure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.flags.length ? (
            detail.flags.map((flag) => (
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
                    <Badge className={triageTone(flag.triage_status)}>
                      {flag.triage_status || "new"}
                    </Badge>
                    <Badge variant="outline">
                      {flag.assignee || "unassigned"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-100/78">
                  <Link
                    href={`/accounts/${encodeURIComponent(flag.address)}`}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-1 transition hover:bg-white/12"
                  >
                    {formatAddress(flag.address, 7)}
                  </Link>
                  {flag.tx_hash ? (
                    <Link
                      href={`/transactions/${encodeURIComponent(flag.tx_hash)}`}
                      className="rounded-full border border-white/12 bg-white/8 px-3 py-1 transition hover:bg-white/12"
                    >
                      {formatAddress(flag.tx_hash, 7)}
                    </Link>
                  ) : null}
                  <span>{formatDateTime(flag.detected_at)}</span>
                  {flag.reviewed_at ? (
                    <span>reviewed {formatDateTime(flag.reviewed_at)}</span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-100/78">
                  {flag.why_flagged ? <p>Why flagged: {flag.why_flagged}</p> : null}
                  {flag.trigger_logic ? <p>Trigger logic: {flag.trigger_logic}</p> : null}
                  {flag.provenance ? <p>Provenance: {flag.provenance}</p> : null}
                  {flag.next_action ? <p>Next action: {flag.next_action}</p> : null}
                </div>
                {flag.analyst_note ? (
                  <p className="mt-3 text-sm text-slate-100/78">{flag.analyst_note}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-300/72">
              No flags have been linked into this case yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
