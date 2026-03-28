"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle, NotebookPen, Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AddressTag, InvestigatorNote } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type CaseWorkbenchProps = {
  address: string;
  initialNotes: InvestigatorNote[];
  initialTags: AddressTag[];
};

export function CaseWorkbench({
  address,
  initialNotes,
  initialTags,
}: CaseWorkbenchProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [tags, setTags] = useState(initialTags);
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
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

  function createNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) {
      return;
    }

    startTransition(async () => {
      setStatus("");
      const response = await fetch(
        `/api/forensic/accounts/${encodeURIComponent(address)}/notes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            author: author.trim(),
            note: note.trim(),
          }),
        },
      );

      if (!response.ok) {
        setStatus("Unable to save note right now.");
        return;
      }

      const created = (await response.json()) as InvestigatorNote;
      setNotes((current) => [created, ...current]);
      setNote("");
      setStatus("Note added to the dossier.");
    });
  }

  function createTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tag.trim()) {
      return;
    }

    startTransition(async () => {
      setStatus("");
      const response = await fetch(
        `/api/forensic/accounts/${encodeURIComponent(address)}/tags`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tag: tag.trim() }),
        },
      );

      if (!response.ok) {
        setStatus("Unable to save tag right now.");
        return;
      }

      const created = (await response.json()) as AddressTag;
      setTags((current) => [created, ...current]);
      setTag("");
      setStatus("Tag added to the dossier.");
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
          <form className="flex gap-2" onSubmit={createTag}>
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
