import Link from "next/link";
import { ArrowRight, Binary, Flag, Network } from "lucide-react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { maybeApiFetch } from "@/lib/api";
import type { AccountProfile, ForensicFlag, Transaction } from "@/lib/types";
import {
  entityTone,
  formatAddress,
  formatDateTime,
  formatWeiToEth,
  formatWeiToGwei,
  riskTone,
  triageTone,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{
  hash: string;
}>;

function toHexPayload(data: Transaction["data"]) {
  if (!data) {
    return "0x";
  }
  if (Array.isArray(data)) {
    return `0x${Buffer.from(data).toString("hex")}`;
  }
  if (typeof data === "string") {
    if (data.startsWith("0x")) {
      return data;
    }
    try {
      return `0x${Buffer.from(data, "base64").toString("hex")}`;
    } catch {
      return data;
    }
  }
  return "0x";
}

export default async function TransactionPage({
  params,
}: {
  params: RouteParams;
}) {
  const { hash } = await params;
  const tx = await maybeApiFetch<Transaction>(`/transactions/${hash}`);

  if (!tx) {
    return (
      <div className="space-y-6 pb-10">
        <PageHeading
          eyebrow="Transaction Investigation"
          title="Transaction not found."
          description="The requested transaction is not available from the forensic backend right now."
          actions={
            <Button asChild variant="secondary">
              <Link href="/overview">
                Back to overview
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [flags, fromProfile, toProfile] = await Promise.all([
    maybeApiFetch<ForensicFlag[]>(`/transactions/${encodeURIComponent(hash)}/flags`),
    maybeApiFetch<AccountProfile>(`/accounts/${encodeURIComponent(tx.from)}/profile`),
    tx.to
      ? maybeApiFetch<AccountProfile>(`/accounts/${encodeURIComponent(tx.to)}/profile`)
      : Promise.resolve(null),
  ]);

  const payloadHex = toHexPayload(tx.data);

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Transaction Investigation"
        title={formatAddress(tx.hash, 12)}
        description="Inspect one transaction as an investigative object: counterparties, value, calldata, linked flags, and pivots into dossiers or graph tracing."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/accounts/${encodeURIComponent(tx.from)}`}>
                Open sender dossier
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/graph?address=${encodeURIComponent(tx.from)}&depth=2`}>
                Trace sender in graph
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Value
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {formatWeiToEth(tx.value)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Block
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {tx.block_number}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Gas price
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {formatWeiToGwei(tx.gas_price)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-black/20 shadow-none">
          <CardContent className="pt-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/72">
              Observed
            </div>
            <div className="mt-3 text-base font-semibold text-white">
              {formatDateTime(tx.timestamp)}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-cyan-100">
              <Network className="size-5" />
              <CardTitle className="text-white">Counterparties</CardTitle>
            </div>
            <CardDescription>
              Pivot directly into the sender and recipient dossiers from this transaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href={`/accounts/${encodeURIComponent(tx.from)}`}
              className="block rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {fromProfile?.entity_name || "Sender"}
                  </div>
                  <div className="mt-1 text-sm text-slate-300/76">{tx.from}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={entityTone(fromProfile?.entity_type)}
                  >
                    {fromProfile?.entity_type || "wallet"}
                  </Badge>
                  <Badge className={riskTone(fromProfile?.risk_level)}>
                    {fromProfile?.risk_level || "observed"}
                  </Badge>
                </div>
              </div>
            </Link>

            {tx.to ? (
              <Link
                href={`/accounts/${encodeURIComponent(tx.to)}`}
                className="block rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-400/6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {toProfile?.entity_name || "Recipient"}
                    </div>
                    <div className="mt-1 text-sm text-slate-300/76">{tx.to}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={entityTone(toProfile?.entity_type)}>
                      {toProfile?.entity_type || "wallet"}
                    </Badge>
                    <Badge className={riskTone(toProfile?.risk_level)}>
                      {toProfile?.risk_level || "observed"}
                    </Badge>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-slate-300/78">
                This transaction appears to be a contract creation and has no explicit
                `to` address.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-cyan-100">
              <Binary className="size-5" />
              <CardTitle className="text-white">Payload</CardTitle>
            </div>
            <CardDescription>
              Raw calldata or byte payload carried by the transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="font-mono text-xs leading-6 text-cyan-100 [overflow-wrap:anywhere]">
                {payloadHex}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-cyan-100">
            <Flag className="size-5" />
            <CardTitle className="text-white">Linked forensic flags</CardTitle>
          </div>
          <CardDescription>
            Every flag already tied to this transaction, with rationale and next-step guidance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(flags || []).length ? (
            flags!.map((flag) => (
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
                      {flag.confidence || "medium"} confidence
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-sm text-slate-100/80">
                  {flag.why_flagged ? <p>Why flagged: {flag.why_flagged}</p> : null}
                  {flag.trigger_logic ? <p>Trigger logic: {flag.trigger_logic}</p> : null}
                  {flag.provenance ? <p>Provenance: {flag.provenance}</p> : null}
                  {flag.next_action ? <p>Next action: {flag.next_action}</p> : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-100/78">
                  <Link
                    href={`/accounts/${encodeURIComponent(flag.address)}`}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-1 transition hover:bg-white/12"
                  >
                    {formatAddress(flag.address, 7)}
                  </Link>
                  <span>{formatDateTime(flag.detected_at)}</span>
                  {flag.case_id && flag.case_title ? (
                    <Link
                      href={`/cases/${flag.case_id}`}
                      className="rounded-full border border-white/12 bg-white/8 px-3 py-1 transition hover:bg-white/12"
                    >
                      {flag.case_title}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-300/72">
              No forensic flags are linked to this transaction right now.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
