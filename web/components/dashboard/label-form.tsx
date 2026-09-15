"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientApiPost } from "@/lib/client-api";
import type { KnownEntity } from "@/lib/types";

const ENTITY_TYPES = ["wallet", "exchange", "mixer", "bridge", "dex", "token", "stablecoin", "contract", "scam", "sanctioned", "other"];
const RISK_LEVELS = ["none", "low", "medium", "high"];

const selectClass =
  "flex h-11 w-full rounded-[20px] border border-[color:var(--border)] bg-white px-4 text-sm text-[#152319] outline-none focus:border-[#9bc58b] focus:ring-2 focus:ring-[#dbeace]";

/**
 * Lets an investigator record a label in known_entities. Labelling a contract medium
 * or high risk makes the backend flag stored contracts from the same code family.
 */
export function LabelForm({
  address,
  isContract,
  initial,
}: {
  address: string;
  isContract: boolean;
  initial: { name: string; entity_type: string; risk_level: string; source: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [entityType, setEntityType] = useState(initial.entity_type || (isContract ? "contract" : "wallet"));
  const [riskLevel, setRiskLevel] = useState(initial.risk_level || "none");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await clientApiPost<{ entity: KnownEntity; flagged_similar_contracts: number }>(
        `/entities/${encodeURIComponent(address)}`,
        { name, entity_type: entityType, risk_level: riskLevel },
      );
      const clones = result.flagged_similar_contracts;
      setMessage({
        tone: "ok",
        text:
          clones > 0
            ? `Label saved. ${clones} contract${clones === 1 ? "" : "s"} with near-identical code flagged.`
            : "Label saved.",
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Saving the label failed." });
    }
  }

  const fieldId = `label-${address.slice(2, 10)}`;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${fieldId}-name`} className="text-xs font-medium text-[#4d5b50]">
          Name
        </label>
        <Input
          id={`${fieldId}-name`}
          value={name}
          maxLength={80}
          required
          onChange={(event) => setName(event.target.value)}
          placeholder={isContract ? "e.g. Sweeper drainer" : "e.g. Exchange hot wallet"}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${fieldId}-type`} className="text-xs font-medium text-[#4d5b50]">
            Type
          </label>
          <select id={`${fieldId}-type`} value={entityType} onChange={(event) => setEntityType(event.target.value)} className={selectClass}>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${fieldId}-risk`} className="text-xs font-medium text-[#4d5b50]">
            Risk
          </label>
          <select id={`${fieldId}-risk`} value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)} className={selectClass}>
            {RISK_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending || !name.trim()}>
        <Tag />
        {initial.source ? "Update label" : "Save label"}
      </Button>
      {message ? (
        <p role="status" className={message.tone === "ok" ? "text-sm text-[#2b6631]" : "text-sm text-[#933f34]"}>
          {message.text}
        </p>
      ) : null}
      {initial.source ? (
        <p className="text-xs text-[#7e887f]">
          Current label source: <span className="font-medium">{initial.source}</span>
        </p>
      ) : null}
    </form>
  );
}
