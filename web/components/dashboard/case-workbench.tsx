"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  BriefcaseBusiness,
  FolderPlus,
  LoaderCircle,
  NotebookPen,
  Tags,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clientApiFetch } from "@/lib/client-api";
import type {
  AddressTag,
  InvestigationCaseSummary,
  InvestigatorNote,
} from "@/lib/types";
import {
  caseStatusTone,
  formatDateTime,
  priorityTone,
} from "@/lib/utils";

type CaseWorkbenchProps = {
  address: string;
  initialNotes: InvestigatorNote[];
  initialTags: AddressTag[];
  initialCases: InvestigationCaseSummary[];
  availableCases: InvestigationCaseSummary[];
};

const selectClassName =
  "h-10 w-full rounded-[18px] border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/35 focus:ring-2 focus:ring-cyan-400/15";

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

export function CaseWorkbench({
  address,
  initialNotes,
  initialTags,
  initialCases,
  availableCases,
}: CaseWorkbenchProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [tags, setTags] = useState(initialTags);
  const [linkedCases, setLinkedCases] = useState(
    mergeCaseSummaries([], initialCases),
  );
  const [caseOptions, setCaseOptions] = useState(
    mergeCaseSummaries([], availableCases),
  );
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [selectedCaseID, setSelectedCaseID] = useState("");
  const [linkRole, setLinkRole] = useState("subject");
  const [linkNote, setLinkNote] = useState("");
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const [newCaseSummary, setNewCaseSummary] = useState("");
  const [newCaseOwner, setNewCaseOwner] = useState("");
  const [newCasePriority, setNewCasePriority] = useState("medium");
  const [newCaseRole, setNewCaseRole] = useState("subject");
  const [newCaseNote, setNewCaseNote] = useState("");
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  const sortedNotes = useMemo(
    () =>
      [...notes].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      ),
    [notes],
  );

  const allCaseOptions = useMemo(
    () => mergeCaseSummaries(caseOptions, linkedCases),
    [caseOptions, linkedCases],
  );

  function createNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) {
      return;
    }

    startTransition(async () => {
      try {
        setStatus("");
        const created = await clientApiFetch<InvestigatorNote>(
          `/accounts/${encodeURIComponent(address)}/notes`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              author: author.trim(),
              note: note.trim(),
            }),
          },
        );

        setNotes((current) => [created, ...current]);
        setNote("");
        setStatus("Note added to the dossier.");
      } catch {
        setStatus("Unable to save note right now.");
      }
    });
  }

  function createTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tag.trim()) {
      return;
    }

    startTransition(async () => {
      try {
        setStatus("");
        const created = await clientApiFetch<AddressTag>(
          `/accounts/${encodeURIComponent(address)}/tags`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tag: tag.trim() }),
          },
        );

        setTags((current) => [created, ...current]);
        setTag("");
        setStatus("Tag added to the dossier.");
      } catch {
        setStatus("Unable to save tag right now.");
      }
    });
  }

  function createCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCaseTitle.trim()) {
      setStatus("Give the investigation a case title first.");
      return;
    }

    startTransition(async () => {
      try {
        setStatus("");
        const created = await clientApiFetch<InvestigationCaseSummary>("/cases", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: newCaseTitle.trim(),
            summary: newCaseSummary.trim(),
            owner: newCaseOwner.trim(),
            priority: newCasePriority,
            address,
            role: newCaseRole,
            note: newCaseNote.trim(),
          }),
        });

        setLinkedCases((current) => mergeCaseSummaries(current, [created]));
        setCaseOptions((current) => mergeCaseSummaries(current, [created]));
        setNewCaseTitle("");
        setNewCaseSummary("");
        setNewCaseOwner("");
        setNewCasePriority("medium");
        setNewCaseRole("subject");
        setNewCaseNote("");
        setStatus("New investigation case opened and linked to this address.");
      } catch {
        setStatus("Unable to open a new case right now.");
      }
    });
  }

  function linkExistingCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCaseID) {
      setStatus("Choose a case to attach this address to.");
      return;
    }

    startTransition(async () => {
      try {
        setStatus("");
        await clientApiFetch(
          `/cases/${encodeURIComponent(selectedCaseID)}/addresses`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              address,
              role: linkRole,
              note: linkNote.trim(),
            }),
          },
        );

        const selected = allCaseOptions.find(
          (item) => item.id === Number(selectedCaseID),
        );
        if (selected) {
          const alreadyLinked = linkedCases.some(
            (item) => item.id === Number(selectedCaseID),
          );
          const refreshed = {
            ...selected,
            address_count: alreadyLinked
              ? selected.address_count
              : selected.address_count + 1,
            updated_at: new Date().toISOString(),
          };
          setLinkedCases((current) => mergeCaseSummaries(current, [refreshed]));
          setCaseOptions((current) => mergeCaseSummaries(current, [refreshed]));
        }

        setSelectedCaseID("");
        setLinkRole("subject");
        setLinkNote("");
        setStatus("Address linked into the selected investigation case.");
      } catch {
        setStatus("Unable to link this address into the selected case right now.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-white">Case workbench</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Tags className="size-4 text-cyan-200" />
            Tags
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.length ? (
              tags.map((item) => (
                <Badge key={item.id} variant="outline">
                  {item.tag}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-slate-300/70">
                No investigator tags yet.
              </span>
            )}
          </div>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={createTag}>
            <Input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="Add a tag like exchange, phishing, bot"
            />
            <Button type="submit" variant="secondary" disabled={isPending}>
              Add
            </Button>
          </form>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <BriefcaseBusiness className="size-4 text-cyan-200" />
            Linked investigation cases
          </div>
          <div className="space-y-3">
            {linkedCases.length ? (
              linkedCases.map((item) => (
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
                  <div className="mt-3 text-xs text-slate-400">
                    {item.address_count} address{item.address_count === 1 ? "" : "es"} ·{" "}
                    {item.open_flag_count} open flag
                    {item.open_flag_count === 1 ? "" : "s"} · updated{" "}
                    {formatDateTime(item.updated_at)}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-300/70">
                This address is not linked to any saved investigation case yet.
              </p>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <form
              className="space-y-3 rounded-[24px] border border-white/8 bg-black/20 p-4"
              onSubmit={linkExistingCase}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FolderPlus className="size-4 text-cyan-200" />
                Attach to an existing case
              </div>
              <select
                className={selectClassName}
                value={selectedCaseID}
                onChange={(event) => setSelectedCaseID(event.target.value)}
              >
                <option value="">Choose a case</option>
                {allCaseOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <select
                className={selectClassName}
                value={linkRole}
                onChange={(event) => setLinkRole(event.target.value)}
              >
                <option value="subject">Subject</option>
                <option value="counterparty">Counterparty</option>
                <option value="watch">Watch</option>
                <option value="entity">Entity</option>
                <option value="contract">Contract</option>
              </select>
              <Textarea
                value={linkNote}
                onChange={(event) => setLinkNote(event.target.value)}
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

            <form
              className="space-y-3 rounded-[24px] border border-white/8 bg-black/20 p-4"
              onSubmit={createCase}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FolderPlus className="size-4 text-cyan-200" />
                Open a new case from this address
              </div>
              <Input
                value={newCaseTitle}
                onChange={(event) => setNewCaseTitle(event.target.value)}
                placeholder="Case title"
              />
              <Textarea
                value={newCaseSummary}
                onChange={(event) => setNewCaseSummary(event.target.value)}
                placeholder="Case summary or working hypothesis."
              />
              <Input
                value={newCaseOwner}
                onChange={(event) => setNewCaseOwner(event.target.value)}
                placeholder="Case owner"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClassName}
                  value={newCasePriority}
                  onChange={(event) => setNewCasePriority(event.target.value)}
                >
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                  <option value="critical">Critical priority</option>
                </select>
                <select
                  className={selectClassName}
                  value={newCaseRole}
                  onChange={(event) => setNewCaseRole(event.target.value)}
                >
                  <option value="subject">Subject</option>
                  <option value="counterparty">Counterparty</option>
                  <option value="watch">Watch</option>
                  <option value="entity">Entity</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
              <Textarea
                value={newCaseNote}
                onChange={(event) => setNewCaseNote(event.target.value)}
                placeholder="Optional note for why this address is seeded into the new case."
              />
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
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <NotebookPen className="size-4 text-cyan-200" />
            Investigator notes
          </div>
          <form className="space-y-3" onSubmit={createNote}>
            <Input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Analyst name"
            />
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record intent, risk context, or follow-up steps."
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Save note"
              )}
            </Button>
          </form>
        </div>

        {status ? <p className="text-sm text-cyan-100">{status}</p> : null}

        <div className="space-y-3">
          {sortedNotes.length ? (
            sortedNotes.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[24px] border border-white/8 bg-black/20 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">
                    {entry.author || "Analyst"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(entry.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300/85">
                  {entry.note}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-300/70">
              No case notes yet for this address.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
