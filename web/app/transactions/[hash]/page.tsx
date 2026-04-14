import Link from "next/link";
import { ArrowRight, Binary, Flag, Network } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { maybeApiFetch } from "@/lib/api";
import type { AccountProfile, ForensicFlag, Transaction } from "@/lib/types";
import {
  entityTone,
  formatAddress,
  formatDateTime,
  formatWeiToEth,
  formatWeiToGwei,
  riskTone,
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

function TransactionMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="bg-white/82 shadow-none">
      <CardContent className="pt-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
          {label}
        </div>
        <div className="mt-3 text-2xl font-semibold text-[#132118]">{value}</div>
        <div className="mt-2 text-sm text-[#6c786d]">{detail}</div>
      </CardContent>
    </Card>
  );
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
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
              Transaction Investigation
            </p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                Transaction not found.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[#59675d]">
                The requested transaction is not available from the forensic
                backend right now.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href="/overview">
              Back to overview
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
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
  const isContractCreation = !tx.to;

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
            Transaction Investigation
          </p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]">
                Block {tx.block_number}
              </Badge>
              <Badge className="bg-[#f7faf4] text-[#2b6631] border-[#d7e2d0]">
                {isContractCreation ? "contract creation" : "value transfer"}
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                {formatAddress(tx.hash, 12)}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[#59675d]">
                Counterparties, transfer value, calldata, and linked flags for this
                transaction.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#dbe3d8] bg-white/78 px-4 py-3">
              <div className="font-mono text-sm text-[#2a382f] [overflow-wrap:anywhere]">
                {tx.hash}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/accounts/${encodeURIComponent(tx.from)}`}>
              Open sender profile
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/graph?address=${encodeURIComponent(tx.from)}&depth=2`}>
              Trace sender in graph
              <Network className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/overview">
              Back to overview
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TransactionMetric
          label="Value"
          value={formatWeiToEth(tx.value)}
          detail="Transferred value observed in this transaction"
        />
        <TransactionMetric
          label="Gas price"
          value={formatWeiToGwei(tx.gas_price)}
          detail={`Gas limit ${tx.gas.toLocaleString()}`}
        />
        <TransactionMetric
          label="Nonce"
          value={tx.nonce.toString()}
          detail={`Sender ${formatAddress(tx.from, 6)}`}
        />
        <TransactionMetric
          label="Observed"
          value={formatDateTime(tx.timestamp)}
          detail={`Block ${tx.block_number}`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Network className="size-5" />
                <CardTitle className="text-[#132118]">Counterparty flow</CardTitle>
              </div>
              <CardDescription>
                Open either side of the transaction directly into its account profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <Link
                href={`/accounts/${encodeURIComponent(tx.from)}`}
                className="block rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#132118]">
                      {fromProfile?.entity_name || "Sender"}
                    </div>
                    <div className="mt-1 font-mono text-xs text-[#607065]">
                      {tx.from}
                    </div>
                    <div className="mt-2 text-xs text-[#728076]">
                      Originating account for nonce {tx.nonce}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={entityTone(fromProfile?.entity_type)}>
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
                  className="block rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#132118]">
                        {toProfile?.entity_name || "Recipient"}
                      </div>
                      <div className="mt-1 font-mono text-xs text-[#607065]">
                        {tx.to}
                      </div>
                      <div className="mt-2 text-xs text-[#728076]">
                        Destination of the transfer payload
                      </div>
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
                <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4 text-sm text-[#556357]">
                  This transaction appears to be a contract creation and has no
                  explicit destination address.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Flag className="size-5" />
                <CardTitle className="text-[#132118]">Linked forensic flags</CardTitle>
              </div>
              <CardDescription>
                Flags already tied to this transaction, including rationale and next
                action guidance.
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
                        <div className="text-sm font-semibold text-[#132118]">
                          {flag.flag_type.replace(/_/g, " ")}
                        </div>
                        <div className="mt-1 text-sm text-[#425145]">
                          {flag.description}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={riskTone(flag.severity)}>
                          {flag.severity}
                        </Badge>
                        <Badge className="bg-white/80 text-[#425145] border-[#d7e2d0]">
                          {flag.confidence || "medium"} confidence
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-[#4e5d52]">
                      {flag.why_flagged ? <p>Why flagged: {flag.why_flagged}</p> : null}
                      {flag.trigger_logic ? (
                        <p>Trigger logic: {flag.trigger_logic}</p>
                      ) : null}
                      {flag.provenance ? <p>Provenance: {flag.provenance}</p> : null}
                      {flag.next_action ? <p>Next action: {flag.next_action}</p> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#607065]">
                      <Link
                        href={`/accounts/${encodeURIComponent(flag.address)}`}
                        className="rounded-full border border-[#d7e2d0] bg-white/88 px-3 py-1 transition hover:bg-white"
                      >
                        {formatAddress(flag.address, 7)}
                      </Link>
                      <span>{formatDateTime(flag.detected_at)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                  No forensic flags are linked to this transaction right now.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Binary className="size-5" />
                <CardTitle className="text-[#132118]">Payload snapshot</CardTitle>
              </div>
              <CardDescription>
                The raw calldata or byte payload included in the transaction.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-xs leading-6 text-[#2b6631] [overflow-wrap:anywhere]">
                  {payloadHex}
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </section>
    </div>
  );
}
