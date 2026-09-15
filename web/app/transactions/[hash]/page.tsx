import Link from "next/link";
import { ArrowRight, Binary, CheckCircle2, Coins, Flag, Network, Timer, XCircle } from "lucide-react";

import { QueryDisclosure } from "@/components/dashboard/query-disclosure";
import { SourceTag, SourceTags } from "@/components/dashboard/source-tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiResult } from "@/lib/api";
import { FLAG_ENGINES, FLAG_LABELS } from "@/lib/flags";
import { QUERIES } from "@/lib/queries";
import type { AccountProfile, BytecodeEvidence, CircularEvidence, ForensicFlag, TokenTransfer, Transaction } from "@/lib/types";
import {
  STATUS_DESCRIPTIONS,
  base64ToHex,
  decodeSelector,
  entityTone,
  formatAddress,
  formatBaseUnits,
  formatDateTime,
  formatExact,
  formatSimilarity,
  formatWeiToEth,
  formatWeiToGwei,
  riskTone,
  statusTone,
  txKind,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ hash: string }>;

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function isCircular(evidence: ForensicFlag["evidence"]): evidence is CircularEvidence {
  return Array.isArray((evidence as CircularEvidence | undefined)?.path);
}

function isBytecode(evidence: ForensicFlag["evidence"]): evidence is BytecodeEvidence {
  return typeof (evidence as BytecodeEvidence | undefined)?.matched_address === "string";
}

function Section({ icon, title, engine, children }: { icon: React.ReactNode; title: string; engine?: "postgres" | "neo4j" | "pgvector"; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
          <span className="text-[#2b6631]">{icon}</span>
          {title}
        </h2>
        {engine ? <SourceTag engine={engine} /> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[20px] border border-[#e8ebe4] bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-[#152319] [overflow-wrap:anywhere]">{value}</div>
      {detail ? <div className="mt-1 text-xs text-[#7b867c]">{detail}</div> : null}
    </div>
  );
}

function PartyCard({ role, address, profile, note }: { role: string; address: string; profile: AccountProfile | null; note: string }) {
  return (
    <Link href={`/accounts/${address}`} className="block rounded-[20px] border border-[#e8ebe4] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">{role}</div>
          <div className="mt-1 text-sm font-semibold text-[#132118]">{profile?.entity_name || formatAddress(address, 8)}</div>
          <div className="mt-1 font-mono text-xs text-[#607065] [overflow-wrap:anywhere]">{address}</div>
          <div className="mt-2 text-xs text-[#728076]">{note}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge className={entityTone(profile?.entity_type)}>{profile?.entity_type ?? "unknown"}</Badge>
          {profile && profile.risk_level !== "none" ? <Badge className={riskTone(profile.risk_level)}>{profile.risk_level}</Badge> : null}
        </div>
      </div>
    </Link>
  );
}

function FlagCard({ flag }: { flag: ForensicFlag }) {
  const evidence = flag.evidence;
  return (
    <article className="rounded-[22px] border border-[#e8ebe4] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#132118]">{FLAG_LABELS[flag.flag_type] ?? flag.flag_type}</div>
          <p className="mt-1 text-sm text-[#425145] [overflow-wrap:anywhere]">{flag.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={riskTone(flag.severity)}>{flag.severity}</Badge>
          <SourceTags engines={FLAG_ENGINES[flag.flag_type] ?? ["postgres"]} />
        </div>
      </div>

      {isCircular(evidence) ? (
        <div className="mt-4 rounded-[16px] bg-[#f5f7f2] p-3">
          <div className="text-xs font-medium text-[#56645a]">The loop, in order</div>
          <ol className="mt-2 space-y-1.5">
            {evidence.transaction_hashes.map((hash, index) => (
              <li key={`${hash}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-4 tabular-nums text-[#9aa59b]">{index + 1}</span>
                <Link href={`/accounts/${evidence.path[index]}`} className="font-mono text-[#1c2a1d] hover:underline">{formatAddress(evidence.path[index], 4)}</Link>
                <span className="text-[#9aa59b]">→</span>
                <Link href={`/accounts/${evidence.path[index + 1]}`} className="font-mono text-[#1c2a1d] hover:underline">{formatAddress(evidence.path[index + 1], 4)}</Link>
                <Badge variant="outline">{evidence.kinds[index] === "token" ? "token" : "ETH"}</Badge>
                <Link href={`/transactions/${hash}`} className="font-mono text-[#607065] hover:underline">{formatAddress(hash, 4)}</Link>
              </li>
            ))}
          </ol>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link href={`/graph?address=${evidence.path[1]}&depth=2&to=${evidence.path[0]}`}>
              Open loop in graph
              <Network />
            </Link>
          </Button>
        </div>
      ) : null}

      {isBytecode(evidence) ? (
        <div className="mt-4 grid gap-2 rounded-[16px] bg-[#f5f7f2] p-3 text-xs sm:grid-cols-3">
          <div>
            <div className="text-[#7e887f]">Matched contract</div>
            <Link href={`/contracts/${evidence.matched_address}`} className="font-mono text-[#1c2a1d] hover:underline">{formatAddress(evidence.matched_address, 5)}</Link>
          </div>
          <div>
            <div className="text-[#7e887f]">Similarity</div>
            <div className="font-semibold tabular-nums">{formatSimilarity(evidence.similarity)} (threshold {formatSimilarity(evidence.threshold)})</div>
          </div>
          <div>
            <div className="text-[#7e887f]">Relation</div>
            <div className="font-semibold">{evidence.same_skeleton ? "identical code structure" : "near-identical"} · {evidence.matched_risk}</div>
          </div>
        </div>
      ) : null}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {[
          ["Why it was flagged", flag.why_flagged],
          ["Detection rule", flag.trigger_logic],
          ["Produced by", flag.provenance],
          ["Suggested next step", flag.next_action],
        ].map(([label, text]) =>
          text ? (
            <div key={label}>
              <dt className="text-xs font-medium text-[#7e887f]">{label}</dt>
              <dd className="mt-0.5 leading-6 text-[#425145]">{text}</dd>
            </div>
          ) : null,
        )}
      </dl>
      <div className="mt-3 text-xs text-[#8a948b]">Detected {formatDateTime(flag.detected_at)} · method: {flag.confidence}</div>
    </article>
  );
}

export default async function TransactionPage({ params }: { params: RouteParams }) {
  const { hash } = await params;
  const txResult = await apiResult<Transaction>(`/transactions/${encodeURIComponent(hash)}`);
  const tx = txResult.data;

  if (!tx) {
    const title = txResult.status === 400 ? "That is not a valid transaction hash." : txResult.status === 404 ? "This transaction has not been observed." : "The transaction could not be loaded.";
    return (
      <div className="space-y-4 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-[#132118]">{title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[#59675d]">
          {txResult.status === 404 ? "Forensic Listener stores transactions seen in the node's mempool or in blocks mined since ingestion started." : txResult.error}
        </p>
        <p className="font-mono text-sm text-[#59675d] [overflow-wrap:anywhere]">{hash}</p>
        <Button asChild variant="secondary">
          <Link href="/overview">Back to overview</Link>
        </Button>
      </div>
    );
  }

  const [flagsResult, transfersResult, fromProfile, toProfile] = await Promise.all([
    apiResult<ForensicFlag[]>(`/transactions/${tx.hash}/flags`),
    apiResult<TokenTransfer[]>(`/transactions/${tx.hash}/token-transfers`),
    apiResult<AccountProfile>(`/accounts/${tx.from}/profile`),
    tx.to || tx.created_contract ? apiResult<AccountProfile>(`/accounts/${tx.to || tx.created_contract}/profile`) : Promise.resolve(null),
  ]);
  const flags = flagsResult.data ?? [];
  const transfers = transfersResult.data ?? [];

  const payloadHex = base64ToHex(tx.data);
  const selector = decodeSelector(payloadHex);
  const isDynamicFee = tx.type >= 2;
  const feePaid =
    tx.gas_used !== null && tx.effective_gas_price ? (BigInt(tx.gas_used) * BigInt(tx.effective_gas_price)).toString() : null;
  const observedMs = new Date(tx.timestamp).getTime();
  const minedMs = tx.mined_at ? new Date(tx.mined_at).getTime() : null;
  const seenPendingFirst = minedMs !== null && minedMs - observedMs > 1000;

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{txKind(tx)}</Badge>
            <Badge className={statusTone(tx.status)}>{tx.status}</Badge>
            {tx.receipt_status === 0 ? <Badge variant="danger">reverted</Badge> : null}
            {flags.length ? <Badge variant="danger">{flags.length} flag{flags.length > 1 ? "s" : ""}</Badge> : null}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#132118] sm:text-4xl">Transaction {formatAddress(tx.hash, 8)}</h1>
          <p className="font-mono text-sm text-[#2a382f] [overflow-wrap:anywhere]">{tx.hash}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/accounts/${tx.from}`}>
              Sender profile
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/graph?address=${tx.from}&depth=2`}>
              Sender in graph
              <Network />
            </Link>
          </Button>
        </div>
      </section>

      <Section icon={<Timer className="size-4" />} title="Lifecycle" engine="postgres">
        <ol className="grid gap-3 md:grid-cols-3">
          <li className="rounded-[20px] border border-[#e8ebe4] bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">1 · First observed</div>
            <div className="mt-2 text-sm font-semibold text-[#152319]">{formatDateTime(tx.timestamp)}</div>
            <div className="mt-1 text-xs text-[#7b867c]">{seenPendingFirst || tx.status !== "mined" ? "seen in the node's mempool" : "first seen inside a mined block"}</div>
          </li>
          <li className="rounded-[20px] border border-[#e8ebe4] bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">2 · Outcome</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#152319]">
              {tx.status === "mined" ? (
                <>Mined in block {formatExact(tx.block_number)}</>
              ) : (
                <span className="capitalize">{tx.status}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-[#7b867c]">
              {tx.status === "mined" && seenPendingFirst && minedMs ? `included ${formatDuration(minedMs - observedMs)} after it was first seen` : STATUS_DESCRIPTIONS[tx.status]}
            </div>
          </li>
          <li className="rounded-[20px] border border-[#e8ebe4] bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">3 · Execution</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#152319]">
              {tx.receipt_status === 1 ? (
                <><CheckCircle2 className="size-4 text-[#2b6631]" />Succeeded</>
              ) : tx.receipt_status === 0 ? (
                <><XCircle className="size-4 text-[#933f34]" />Reverted</>
              ) : (
                "No receipt yet"
              )}
            </div>
            <div className="mt-1 text-xs text-[#7b867c]">
              {tx.gas_used !== null ? `${formatExact(tx.gas_used)} of ${formatExact(tx.gas)} gas used` : "receipt data arrives when the block is ingested"}
            </div>
          </li>
        </ol>
        <QueryDisclosure query={QUERIES.blockIngest} />
      </Section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Value" value={formatWeiToEth(tx.value, 6)} />
        {isDynamicFee ? (
          <Metric label="Max fee per gas" value={formatWeiToGwei(tx.gas_price)} detail={tx.max_priority_fee ? `priority tip up to ${formatWeiToGwei(tx.max_priority_fee)}` : undefined} />
        ) : (
          <Metric label="Gas price" value={formatWeiToGwei(tx.gas_price)} detail="legacy transaction" />
        )}
        <Metric
          label="Fee paid"
          value={feePaid ? formatWeiToEth(feePaid, 6) : "Not mined"}
          detail={tx.effective_gas_price ? `effective ${formatWeiToGwei(tx.effective_gas_price)} per gas` : undefined}
        />
        <Metric label="Nonce" value={formatExact(tx.nonce)} detail={`type ${tx.type} transaction`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-6">
          <Section icon={<Network className="size-4" />} title="Parties" engine="postgres">
            <div className="grid gap-4 lg:grid-cols-2">
              <PartyCard role="From" address={tx.from} profile={fromProfile.data} note={`sender, nonce ${tx.nonce}`} />
              {tx.to ? (
                <PartyCard role="To" address={tx.to} profile={toProfile?.data ?? null} note={txKind(tx) === "Contract call" ? "contract that was called" : "recipient of the ETH"} />
              ) : tx.created_contract ? (
                <PartyCard role="Created contract" address={tx.created_contract} profile={toProfile?.data ?? null} note="deployed by this transaction" />
              ) : (
                <div className="rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] p-4 text-sm text-[#627065]">
                  Contract creation. The new contract's address is known once the block is ingested.
                </div>
              )}
            </div>
          </Section>

          <Section icon={<Flag className="size-4" />} title="Forensic flags" engine="postgres">
            {flags.length ? (
              <div className="space-y-4">
                {flags.map((flag) => (
                  <FlagCard key={flag.id} flag={flag} />
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-5 text-sm text-[#627065]">
                No detector has flagged this transaction.
              </div>
            )}
          </Section>

          <Section icon={<Coins className="size-4" />} title="Token transfers" engine="postgres">
            {transfers.length ? (
              <div className="overflow-x-auto rounded-[18px] border border-[#ecefe8]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f3f5f1] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#909b91]">
                    <tr>
                      <th className="px-3 py-2.5">Log</th>
                      <th className="px-3 py-2.5">Token</th>
                      <th className="px-3 py-2.5">From → To</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((tt) => (
                      <tr key={tt.log_index} className="border-t border-[#edf0e9] bg-white">
                        <td className="px-3 py-2.5 tabular-nums text-[#7e887f]">#{tt.log_index}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/contracts/${tt.token}`} className="hover:underline">{tt.token_name || formatAddress(tt.token, 4)}</Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                          <Link href={`/accounts/${tt.from}`} className="hover:underline">{formatAddress(tt.from, 4)}</Link>
                          {" → "}
                          <Link href={`/accounts/${tt.to}`} className="hover:underline">{formatAddress(tt.to, 4)}</Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatBaseUnits(tt.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-5 text-sm text-[#627065]">
                {tx.status === "mined" ? "This transaction emitted no ERC-20 Transfer events." : "Transfer events are decoded from the receipt once the transaction is mined."}
              </div>
            )}
          </Section>
        </div>

        <Section icon={<Binary className="size-4" />} title="Calldata">
          {selector ? (
            <div className="mb-3 rounded-[16px] bg-[#f5f7f2] p-3 text-sm">
              <div className="text-xs text-[#7e887f]">Function selector</div>
              <div className="font-mono text-[#1c2a1d]">{selector.selector}</div>
              <div className="mt-1 font-mono text-xs text-[#425145] [overflow-wrap:anywhere]">{selector.signature ?? "not in the built-in signature list"}</div>
            </div>
          ) : (
            <p className="mb-3 text-sm text-[#627065]">No calldata: a plain ETH transfer.</p>
          )}
          <details open={payloadHex.length <= 400} className="rounded-[16px] border border-[#e3e8e0] bg-white">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[#56645a]">Raw bytes ({formatExact((payloadHex.length - 2) / 2)} bytes)</summary>
            <pre className="max-h-[320px] overflow-auto border-t border-[#e3e8e0] px-3 py-2 font-mono text-[11px] leading-5 text-[#2b6631] [overflow-wrap:anywhere] whitespace-pre-wrap">{payloadHex}</pre>
          </details>
        </Section>
      </section>
    </div>
  );
}
