import Link from "next/link";
import { AlertTriangle, ArrowRight, Brain, Coins, FileCode2, Flag, Network, Tag, Waves } from "lucide-react";

import { LabelForm } from "@/components/dashboard/label-form";
import { HourlyBars } from "@/components/dashboard/line-chart";
import { QueryDisclosure } from "@/components/dashboard/query-disclosure";
import { type Engine, SourceTag } from "@/components/dashboard/source-tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiResult } from "@/lib/api";
import { FLAG_LABELS } from "@/lib/flags";
import { QUERIES } from "@/lib/queries";
import type { AccountBehaviorProfile, AccountProfile, AccountVelocityPoint, SimilarAccountMatch } from "@/lib/types";
import {
  entityTone,
  formatAddress,
  formatBaseUnits,
  formatDateTime,
  formatExact,
  formatRelativeTime,
  formatSimilarity,
  formatWeiToEth,
  riskTone,
  statusTone,
  txKind,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ address: string }>;

const FEATURES: { key: string; label: string; format: (v: number) => string }[] = [
  { key: "sent_count", label: "Transactions sent", format: (v) => formatExact(v) },
  { key: "received_count", label: "Transactions received", format: (v) => formatExact(v) },
  { key: "send_receive_balance", label: "Send / receive balance", format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} (+1 only sends)` },
  { key: "avg_sent_eth", label: "Average value sent", format: (v) => `${v.toFixed(4)} ETH` },
  { key: "avg_gas_price_gwei", label: "Average max fee", format: (v) => `${v.toFixed(2)} gwei` },
  { key: "counterparty_diversity", label: "Distinct counterparties per tx", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "contract_call_ratio", label: "Sent txs calling contracts", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "recent_burst_ratio", label: "Last-hour share of last 24 h", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "night_ratio", label: "Active 00:00–05:59 UTC", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "weekend_ratio", label: "Active at weekends", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "active_span_hours", label: "Active span", format: (v) => (v >= 48 ? `${(v / 24).toFixed(1)} days` : `${v.toFixed(1)} hours`) },
];

function Card({
  icon,
  title,
  description,
  engine,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  engine?: Engine;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#e8ebe4] bg-[#fbfcf8] p-5 shadow-[0_12px_28px_rgba(28,41,26,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a271c]">
            <span className="text-[#2b6631]">{icon}</span>
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-[#7b867c]">{description}</p> : null}
        </div>
        {engine ? <SourceTag engine={engine} /> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-5 text-sm leading-6 text-[#627065]">{children}</div>;
}

function Tile({ label, value, detail, engine }: { label: string; value: string; detail: string; engine: Engine }) {
  return (
    <div className="rounded-[22px] border border-[#e8ebe4] bg-[#fdfefb] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a948b]">{label}</span>
        <SourceTag engine={engine} />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-[#152319]">{value}</div>
      <div className="mt-1 text-xs text-[#7b867c]">{detail}</div>
    </div>
  );
}

export default async function AccountPage({ params }: { params: RouteParams }) {
  const { address } = await params;

  const [profileResult, behaviorResult, similarResult, velocityResult] = await Promise.all([
    apiResult<AccountProfile>(`/accounts/${encodeURIComponent(address)}/profile`),
    apiResult<AccountBehaviorProfile>(`/accounts/${encodeURIComponent(address)}/behavior`),
    apiResult<SimilarAccountMatch[]>(`/accounts/${encodeURIComponent(address)}/similar?limit=6`),
    apiResult<AccountVelocityPoint[]>(`/accounts/${encodeURIComponent(address)}/velocity?hours=72`),
  ]);

  const profile = profileResult.data;
  if (!profile) {
    const title =
      profileResult.status === 400 ? "That is not a valid address." : profileResult.status === 404 ? "This address has not been observed." : "The profile could not be loaded.";
    const detail =
      profileResult.status === 404
        ? "Forensic Listener only knows addresses that appeared in transactions it has ingested."
        : profileResult.error;
    return (
      <div className="space-y-4 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-[#132118]">{title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[#59675d]">{detail}</p>
        <p className="font-mono text-sm text-[#59675d] [overflow-wrap:anywhere]">{address}</p>
        <Button asChild variant="secondary">
          <Link href="/overview">Back to overview</Link>
        </Button>
      </div>
    );
  }

  const behavior = behaviorResult.data;
  const similar = similarResult.data ?? [];
  const velocity = velocityResult.data ?? [];
  const riskReason =
    profile.risk_level === "none"
      ? "No curated label or forensic flag indicates risk."
      : profile.label_risk === profile.risk_level && profile.flag_risk !== profile.risk_level
        ? `Set by the ${profile.label_source || "curated"} label (${profile.label_risk}).`
        : profile.flag_risk === profile.risk_level && profile.label_risk !== profile.risk_level
          ? `Set by its most severe forensic flag (${profile.flag_risk}).`
          : `Label and flags both indicate ${profile.risk_level} risk.`;

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge className={entityTone(profile.entity_type)}>{profile.entity_type}</Badge>
            <Badge className={riskTone(profile.risk_level)}>{profile.risk_level === "none" ? "no risk signals" : `${profile.risk_level} risk`}</Badge>
            {profile.is_hub ? <Badge variant="outline">labelled hub</Badge> : null}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#132118] sm:text-4xl">
            {profile.entity_name || formatAddress(profile.address, 10)}
          </h1>
          <p className="font-mono text-sm text-[#2a382f] [overflow-wrap:anywhere]">{profile.address}</p>
          <p className="text-sm text-[#6b776d]">
            First observed {formatDateTime(profile.first_seen)} · last active {formatRelativeTime(profile.last_seen)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/graph?address=${profile.address}&depth=2`}>
              View in graph
              <Network />
            </Link>
          </Button>
          {profile.is_contract ? (
            <Button asChild>
              <Link href={`/contracts/${profile.address}`}>
                Contract analysis
                <FileCode2 />
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="Balance"
          value={profile.balance ? formatWeiToEth(profile.balance, 3) : "Unavailable"}
          detail={profile.balance ? "read live from the node" : "the node did not answer"}
          engine="node"
        />
        <Tile label="Transactions" value={formatExact(profile.total_count)} detail={`${formatExact(profile.sent_count)} sent · ${formatExact(profile.received_count)} received`} engine="postgres" />
        <Tile label="Counterparties" value={formatExact(profile.counterparty_count)} detail="distinct addresses transacted with" engine="postgres" />
        <Tile label="Token transfers" value={formatExact(profile.token_transfer_count)} detail="ERC-20 transfers in or out" engine="postgres" />
        <Tile label="Flags" value={formatExact(profile.flag_count)} detail={`${formatExact(profile.high_severity_flag_count)} high severity`} engine="postgres" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <div className="space-y-6">
          <Card icon={<Flag className="size-4" />} title="Forensic flags" description="Detections raised against this address." engine="postgres">
            {profile.flags.length ? (
              <div className="space-y-3">
                {profile.flags.map((flag) => (
                  <Link key={flag.id} href={`/transactions/${flag.tx_hash}`} className="block rounded-[20px] border border-[#ecefe8] bg-white p-4 transition hover:border-[#b4cda8]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#172318]">{FLAG_LABELS[flag.flag_type] ?? flag.flag_type}</div>
                        <div className="mt-1 text-sm text-[#5f6b61] [overflow-wrap:anywhere]">{flag.description}</div>
                      </div>
                      <Badge className={riskTone(flag.severity)}>{flag.severity}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-[#7e887f]">{formatRelativeTime(flag.detected_at)}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>No flags have been raised against this address.</Empty>
            )}
          </Card>

          <Card icon={<ArrowRight className="size-4" />} title="Recent transactions" description="Latest transactions sent or received." engine="postgres">
            {profile.recent_transactions.length ? (
              <div className="overflow-x-auto rounded-[18px] border border-[#ecefe8]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f3f5f1] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#909b91]">
                    <tr>
                      <th className="px-3 py-2.5">Direction</th>
                      <th className="px-3 py-2.5">Counterparty</th>
                      <th className="px-3 py-2.5 text-right">Value</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.recent_transactions.map((tx) => {
                      const outbound = tx.from.toLowerCase() === profile.address.toLowerCase();
                      const counterparty = outbound ? tx.to : tx.from;
                      return (
                        <tr key={tx.hash} className="border-t border-[#edf0e9] bg-white">
                          <td className="px-3 py-2.5">
                            <Link href={`/transactions/${tx.hash}`} className="font-medium text-[#1d2b1e] hover:underline">
                              {outbound ? "Out" : "In"}
                            </Link>
                            <div className="text-[11px] text-[#8a948b]">{txKind(tx)}</div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs">
                            {counterparty ? <Link href={`/accounts/${counterparty}`} className="hover:underline">{formatAddress(counterparty, 5)}</Link> : "new contract"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatWeiToEth(tx.value, 3)}</td>
                          <td className="px-3 py-2.5">
                            <Badge className={statusTone(tx.status)}>{tx.status}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#5b685d]">{formatRelativeTime(tx.timestamp)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No transactions involving this address have been stored.</Empty>
            )}
          </Card>

          <Card icon={<Coins className="size-4" />} title="Token transfers" description="ERC-20 Transfer events where this address is the sender or recipient." engine="postgres">
            {profile.recent_token_transfers.length ? (
              <div className="space-y-2">
                {profile.recent_token_transfers.map((tt) => {
                  const outbound = tt.from.toLowerCase() === profile.address.toLowerCase();
                  const other = outbound ? tt.to : tt.from;
                  return (
                    <Link key={`${tt.tx_hash}-${tt.log_index}`} href={`/transactions/${tt.tx_hash}`} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#ecefe8] bg-white px-4 py-3 text-sm transition hover:border-[#b4cda8]">
                      <span className="min-w-0">
                        <span className="font-medium text-[#1c2a1d]">{outbound ? "Sent" : "Received"} {formatBaseUnits(tt.amount)}</span>
                        <span className="block text-xs text-[#7e887f]">
                          {tt.token_name || formatAddress(tt.token, 4)} · {outbound ? "to" : "from"} {formatAddress(other, 4)} · block {formatExact(tt.block_number)}
                        </span>
                      </span>
                      <span className="text-xs text-[#7e887f]">{formatRelativeTime(tt.mined_at)}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty>No token transfers recorded. They are decoded from receipts once transactions are mined.</Empty>
            )}
          </Card>

          <Card
            icon={<Network className="size-4" />}
            title="Top counterparties"
            description={`${Math.min(8, profile.counterparties.length)} of ${formatExact(profile.counterparty_count)} counterparties, by number of transactions.`}
            engine="postgres"
          >
            {profile.counterparties.length ? (
              <div className="space-y-2">
                {profile.counterparties.map((item) => (
                  <Link key={item.address} href={`/accounts/${item.address}`} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#ecefe8] bg-white px-4 py-3 transition hover:border-[#b4cda8]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#1c2a1d]">{item.entity_name || formatAddress(item.address, 8)}</span>
                      <span className="block text-xs text-[#7e887f]">
                        {formatExact(item.sent_count)} sent to · {formatExact(item.received_count)} received from · {formatWeiToEth(item.total_value, 3)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge className={entityTone(item.entity_type)}>{item.entity_type}</Badge>
                      {item.risk_level !== "none" ? <Badge className={riskTone(item.risk_level)}>{item.risk_level}</Badge> : null}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>No counterparties yet.</Empty>
            )}
            <QueryDisclosure query={QUERIES.counterparties} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card icon={<Tag className="size-4" />} title="Risk and label" engine="postgres">
            <div className="rounded-[18px] border border-[#ecefe8] bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#5d6a60]">Combined risk</span>
                <Badge className={riskTone(profile.risk_level)}>{profile.risk_level}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#6f7b72]">
                <span>Label: <b className="text-[#1c2a1d]">{profile.label_risk}</b></span>
                <span>Flags: <b className="text-[#1c2a1d]">{profile.flag_risk}</b></span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#6f7b72]">{riskReason} Risk is the worse of the two, from the address_risk view.</p>
            </div>
            <div className="mt-4">
              <LabelForm
                address={profile.address}
                isContract={profile.is_contract}
                initial={{ name: profile.entity_name, entity_type: profile.label_source ? profile.entity_type : "", risk_level: profile.label_risk, source: profile.label_source }}
              />
            </div>
            <QueryDisclosure query={QUERIES.accountProfile} />
          </Card>

          <Card icon={<Brain className="size-4" />} title="Behaviour profile" description="The eleven features stored as this account's vector." engine="pgvector">
            {behavior ? (
              <>
                <dl className="divide-y divide-[#edf0e9] rounded-[18px] border border-[#ecefe8] bg-white text-sm">
                  {FEATURES.map((feature) => (
                    <div key={feature.key} className="flex items-center justify-between gap-3 px-4 py-2">
                      <dt className="text-[#5d6a60]">{feature.label}</dt>
                      <dd className="font-medium tabular-nums text-[#1c2a1d]">{feature.format(behavior.features[feature.key] ?? 0)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-[#7e887f]">
                  From {formatExact(behavior.sample_size)} transactions · rebuilt {formatRelativeTime(behavior.updated_at)}
                </p>
              </>
            ) : (
              <Empty>
                {behaviorResult.status === 404
                  ? "Not computed yet. Behaviour vectors are rebuilt every 30 seconds for recently active addresses."
                  : behaviorResult.error}
              </Empty>
            )}
          </Card>

          <Card icon={<Brain className="size-4" />} title="Similar accounts" description="Nearest behaviour vectors by cosine similarity (accounts with at least 3 transactions)." engine="pgvector">
            {similar.length ? (
              <div className="space-y-2">
                {similar.map((match) => (
                  <Link key={match.address} href={`/accounts/${match.address}`} className="block rounded-[16px] border border-[#ecefe8] bg-white px-4 py-3 transition hover:border-[#b4cda8]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-[#1c2a1d]">{match.entity_name || formatAddress(match.address, 6)}</span>
                      <span className="text-sm font-semibold tabular-nums text-[#1c2a1d]">{formatSimilarity(match.similarity)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#edf1e8]">
                      <div className="h-full rounded-full bg-[#8a5a12]" style={{ width: `${Math.round(match.similarity * 100)}%` }} />
                    </div>
                    <div className="mt-1.5 text-xs text-[#7e887f]">
                      {match.highlights.join(" · ")} · {formatExact(match.sample_size)} txs
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>{behavior ? "No other accounts with enough history to compare yet." : "Available once this account's behaviour vector is computed."}</Empty>
            )}
            <QueryDisclosure query={QUERIES.similarAccounts} />
          </Card>

          <Card icon={<Waves className="size-4" />} title="Activity, last 72 hours" description="Transactions per hour; dark green is the sent share." engine="postgres">
            {velocity.length ? (
              <HourlyBars points={velocity} />
            ) : (
              <Empty>
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  {velocityResult.error ?? "No activity data."}
                </span>
              </Empty>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
