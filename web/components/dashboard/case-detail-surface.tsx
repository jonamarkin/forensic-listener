"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle, NotebookPen, Radar, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clientApiFetch } from "@/lib/client-api";
import type {
  InvestigationCaseDetail,
  InvestigationCaseSummary,
} from "@/lib/types";
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
  "h-10 w-full rounded-[18px] border border-[#d7e2d0] bg-white px-3 text-sm text-[#132118] outline-none transition focus:border-[#97bf89] focus:ring-2 focus:ring-[#d5e8ce]";

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

function CaseMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-white/82 shadow-none">
      <CardContent className="pt-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
          {label}
        </div>
        <div className="mt-3 text-2xl font-semibold text-[#132118]">{children}</div>
      </CardContent>
    </Card>
  );
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

  function syncDetail(refreshed: InvestigationCaseDetail) {
    setDetail(refreshed);
    setTitle(refreshed.title);
    setSummary(refreshed.summary);
    setOwner(refreshed.owner);
    setStatus(refreshed.status);
    setPriority(refreshed.priority);
  }

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
        syncDetail(refreshed);
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
        <CaseMetric label="Status">
          <Badge className={caseStatusTone(detail.status)}>{detail.status}</Badge>
        </CaseMetric>
        <CaseMetric label="Priority">
          <Badge className={priorityTone(detail.priority)}>{detail.priority}</Badge>
        </CaseMetric>
        <CaseMetric label="Linked addresses">{detail.address_count}</CaseMetric>
        <CaseMetric label="Open flags">{detail.open_flag_count}</CaseMetric>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Radar className="size-5" />
                <CardTitle className="text-[#132118]">Linked addresses</CardTitle>
              </div>
              <CardDescription>
                Addresses already linked to this case.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.addresses.length ? (
                detail.addresses.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/accounts/${encodeURIComponent(entry.address)}`}
                    className="block rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#132118]">
                          {entry.entity_name || formatAddress(entry.address, 8)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-[#607065]">
                          {entry.address}
                        </div>
                        {entry.note ? (
                          <div className="mt-2 text-sm text-[#5d6a60]">{entry.note}</div>
                        ) : null}
                        <div className="mt-2 text-xs text-[#76857a]">
                          Added {formatDateTime(entry.added_at)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={entityTone(entry.entity_type)}>
                          {entry.entity_type || (entry.is_contract ? "contract" : "wallet")}
                        </Badge>
                        <Badge className={riskTone(entry.risk_level)}>
                          {entry.risk_level || "observed"}
                        </Badge>
                        <Badge className="bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]">
                          {entry.role}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                  No addresses have been attached to this case yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <ShieldAlert className="size-5" />
                <CardTitle className="text-[#132118]">Linked flags</CardTitle>
              </div>
              <CardDescription>
                Flags already triaged into this case, with their rationale and current
                handling state.
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
                        <div className="text-sm font-semibold text-[#132118]">
                          {flag.flag_type.replace(/_/g, " ")}
                        </div>
                        <div className="mt-1 text-sm text-[#425145]">
                          {flag.description}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={triageTone(flag.triage_status)}>
                          {flag.triage_status || "new"}
                        </Badge>
                        <Badge className="bg-white/80 text-[#425145] border-[#d7e2d0]">
                          {flag.assignee || "unassigned"}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#607065]">
                      <Link
                        href={`/accounts/${encodeURIComponent(flag.address)}`}
                        className="rounded-full border border-[#d7e2d0] bg-white/88 px-3 py-1 transition hover:bg-white"
                      >
                        {formatAddress(flag.address, 7)}
                      </Link>
                      {flag.tx_hash ? (
                        <Link
                          href={`/transactions/${encodeURIComponent(flag.tx_hash)}`}
                          className="rounded-full border border-[#d7e2d0] bg-white/88 px-3 py-1 transition hover:bg-white"
                        >
                          {formatAddress(flag.tx_hash, 7)}
                        </Link>
                      ) : null}
                      <span>{formatDateTime(flag.detected_at)}</span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-[#4e5d52]">
                      {flag.why_flagged ? <p>Why flagged: {flag.why_flagged}</p> : null}
                      {flag.trigger_logic ? (
                        <p>Trigger logic: {flag.trigger_logic}</p>
                      ) : null}
                      {flag.provenance ? <p>Provenance: {flag.provenance}</p> : null}
                      {flag.next_action ? <p>Next action: {flag.next_action}</p> : null}
                    </div>
                    {flag.analyst_note ? (
                      <p className="mt-3 text-sm text-[#4e5d52]">{flag.analyst_note}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                  No flags have been linked into this case yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <NotebookPen className="size-5" />
                <CardTitle className="text-[#132118]">Case command</CardTitle>
              </div>
              <CardDescription>
                Keep the case state current without turning this page into a long
                admin form.
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
                  placeholder="Working hypothesis or summary."
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

              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-sm text-[#5d6a60]">
                Created {formatDateTime(detail.created_at)} · Updated{" "}
                {formatDateTime(detail.updated_at)} · Owner{" "}
                {detail.owner || "investigator"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Radar className="size-5" />
                <CardTitle className="text-[#132118]">Attach address</CardTitle>
              </div>
              <CardDescription>
                Add another wallet or contract into the investigation cluster.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-3" onSubmit={addAddress}>
                <Input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="0x address to add into the case"
                />
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
            </CardContent>
          </Card>

          {feedback ? (
            <div className="rounded-[22px] border border-[#b8d6ad] bg-[#edf4e8] px-4 py-3 text-sm text-[#2b6631]">
              {feedback}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
