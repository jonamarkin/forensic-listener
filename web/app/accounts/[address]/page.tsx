import Link from "next/link";
import {
  ArrowRight,
  Brain,
  FileCode2,
  Flag,
  Network,
  Waves,
} from "lucide-react";

import { LineChart } from "@/components/dashboard/line-chart";
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
import type {
  AccountBehaviorProfile,
  AccountProfile,
  AccountVelocityPoint,
  SimilarAccountMatch,
} from "@/lib/types";
import {
  entityTone,
  formatAddress,
  formatCount,
  formatDateTime,
  formatSimilarity,
  formatWeiToEth,
  riskTone,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{
  address: string;
}>;

function formatFeatureLabel(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatFeatureValue(value: number) {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function DossierMetric({
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

export default async function AccountPage({
  params,
}: {
  params: RouteParams;
}) {
  const { address } = await params;

  const [profile, behavior, similar, velocity] = await Promise.all([
    maybeApiFetch<AccountProfile>(`/accounts/${encodeURIComponent(address)}/profile`),
    maybeApiFetch<AccountBehaviorProfile>(
      `/accounts/${encodeURIComponent(address)}/behavior`,
    ),
    maybeApiFetch<SimilarAccountMatch[]>(
      `/accounts/${encodeURIComponent(address)}/similar?limit=8`,
    ),
    maybeApiFetch<AccountVelocityPoint[]>(
      `/accounts/${encodeURIComponent(address)}/velocity?hours=72&bucket=hour`,
    ),
  ]);

  if (!profile) {
    return (
      <div className="space-y-6 pb-10">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
              Account Profile
            </p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                Address not found.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[#59675d]">
                The requested address is not available from the forensic backend
                right now.
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

  const topFeatures = Object.entries(behavior?.features || {})
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 5);
  const velocityValues = (velocity || []).map((point) => point.total_count);
  const totalCounterpartyValue = profile.counterparties.reduce((sum, item) => {
    try {
      return sum + BigInt(item.total_value || "0");
    } catch {
      return sum;
    }
  }, BigInt(0));
  const topCounterparties = profile.counterparties.slice(0, 4);
  const recentTransactions = profile.recent_transactions.slice(0, 4);
  const similarMatches = (similar || []).slice(0, 4);

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
            Account Profile
          </p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className={entityTone(profile.entity_type)}>
                {profile.entity_type || (profile.is_contract ? "contract" : "wallet")}
              </Badge>
              <Badge className={riskTone(profile.risk_level)}>
                {profile.risk_level || "observed"}
              </Badge>
              <Badge className={profile.is_hub ? "bg-[#dceff0] text-[#1f6171] border-[#b8dfe1]" : "bg-[#eef1ea] text-[#4d5a50] border-[#dbe3d8]"}>
                {profile.is_hub ? "graph hub" : "standard node"}
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                {profile.entity_name || formatAddress(profile.address, 10)}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[#59675d]">
                Investigator-facing view for lifecycle, counterparties, recent
                transactions, graph context, and behavioral similarity tied to
                this Ethereum address.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#dbe3d8] bg-white/78 px-4 py-3">
              <div className="font-mono text-sm text-[#2a382f] [overflow-wrap:anywhere]">
                {profile.address}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/graph?address=${encodeURIComponent(profile.address)}&depth=2`}>
              View in graph
              <Network className="size-4" />
            </Link>
          </Button>
          {profile.is_contract ? (
            <Button asChild variant="secondary">
              <Link href={`/contracts/${encodeURIComponent(profile.address)}`}>
                Contract analysis
                <FileCode2 className="size-4" />
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href={`/graph?address=${encodeURIComponent(profile.address)}&depth=3`}>
              Trace 3 hops
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DossierMetric
          label="Balance"
          value={formatWeiToEth(profile.balance)}
          detail={`${formatCount(profile.total_count)} observed transactions`}
        />
        <DossierMetric
          label="High-severity flags"
          value={formatCount(profile.high_severity_flag_count)}
          detail={`${formatCount(profile.flag_count)} flags total`}
        />
        <DossierMetric
          label="Counterparties"
          value={formatCount(profile.counterparties.length)}
          detail={`${formatWeiToEth(totalCounterpartyValue.toString())} observed value`}
        />
        <DossierMetric
          label="Total sent"
          value={formatWeiToEth(profile.total_sent)}
          detail={`${formatCount(profile.sent_count)} outbound transfers`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.28fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Flag className="size-5" />
                <CardTitle className="text-[#132118]">Analyst brief</CardTitle>
              </div>
              <CardDescription>
                Core account context.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="text-sm font-semibold text-[#132118]">Lifecycle</div>
                <div className="mt-3 space-y-2 text-sm text-[#566357]">
                  <div>First seen: {formatDateTime(profile.first_seen)}</div>
                  <div>Last seen: {formatDateTime(profile.last_seen)}</div>
                  <div>Sent transfers: {formatCount(profile.sent_count)}</div>
                  <div>Received transfers: {formatCount(profile.received_count)}</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4">
                <div className="text-sm font-semibold text-[#132118]">
                  Classification
                </div>
                <div className="mt-3 space-y-2 text-sm text-[#566357]">
                  <div>Entity label: {profile.entity_name || "Unlabeled"}</div>
                  <div>Risk level: {profile.risk_level || "Unknown"}</div>
                  <div>Contract account: {profile.is_contract ? "yes" : "no"}</div>
                  <div>{profile.is_hub ? "High-degree hub behavior observed." : "No hub designation currently stored."}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <ArrowRight className="size-5" />
                <CardTitle className="text-[#132118]">Recent transactions</CardTitle>
              </div>
              <CardDescription>
                Recent transfers involving this address.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTransactions.length ? (
                recentTransactions.map((tx) => {
                  const direction =
                    tx.from.toLowerCase() === profile.address.toLowerCase()
                      ? "Outbound"
                      : "Inbound";
                  const counterparty =
                    direction === "Outbound" ? tx.to || "Contract creation" : tx.from;

                  return (
                    <Link
                      key={tx.hash}
                      href={`/transactions/${encodeURIComponent(tx.hash)}`}
                      className="block rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#132118]">
                            {direction} · {formatWeiToEth(tx.value)}
                          </div>
                          <div className="mt-1 font-mono text-xs text-[#607065]">
                            {formatAddress(counterparty, 8)}
                          </div>
                          <div className="mt-2 text-xs text-[#728076]">
                            {formatDateTime(tx.timestamp)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs text-[#607065]">
                            {formatAddress(tx.hash, 8)}
                          </div>
                          <div className="mt-2 text-xs text-[#728076]">
                            Block {tx.block_number}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                  No recent transactions were returned for this address.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Network className="size-5" />
                <CardTitle className="text-[#132118]">Top counterparties</CardTitle>
              </div>
              <CardDescription>
                Highest-activity counterparties.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topCounterparties.length ? (
                topCounterparties.map((item) => (
                  <Link
                    key={item.address}
                    href={`/accounts/${encodeURIComponent(item.address)}`}
                    className="block rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#132118]">
                          {item.entity_name || formatAddress(item.address, 8)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-[#607065]">
                          {item.address}
                        </div>
                        <div className="mt-2 text-xs text-[#728076]">
                          {formatCount(item.total_count)} shared transactions ·{" "}
                          {formatWeiToEth(item.total_value)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={entityTone(item.entity_type)}>
                          {item.entity_type || (item.is_contract ? "contract" : "wallet")}
                        </Badge>
                        <Badge className={riskTone(item.risk_level)}>
                          {item.risk_level || "observed"}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                  No counterparties were stored for this address yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Brain className="size-5" />
                <CardTitle className="text-[#132118]">Behavior signature</CardTitle>
              </div>
              <CardDescription>
                Top behavior features and nearest similar accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="text-sm font-semibold text-[#132118]">
                  Top feature weights
                </div>
                <div className="mt-3 space-y-2">
                  {topFeatures.length ? (
                    topFeatures.map(([name, value]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-[#59675d]">
                          {formatFeatureLabel(name)}
                        </span>
                        <span className="font-mono text-[#132118]">
                          {formatFeatureValue(value)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#627065]">
                      No behavior feature vector has been materialized yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {similarMatches.length ? (
                  similarMatches.map((match) => (
                    <Link
                      key={match.address}
                      href={`/accounts/${encodeURIComponent(match.address)}`}
                      className="block rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#132118]">
                            {match.entity_name || formatAddress(match.address, 8)}
                          </div>
                          <div className="mt-1 text-sm text-[#5d6a60]">
                            Similarity {formatSimilarity(match.similarity)}
                          </div>
                          {match.highlights.length ? (
                            <div className="mt-2 text-xs text-[#728076]">
                              {match.highlights.slice(0, 2).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                        <Badge className={riskTone(match.risk_level)}>
                          {match.risk_level || "observed"}
                        </Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[#dbe3d8] bg-[#f8faf5] px-4 py-6 text-sm text-[#627065]">
                    No similar addresses were returned yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Waves className="size-5" />
                <CardTitle className="text-[#132118]">Velocity snapshot</CardTitle>
              </div>
              <CardDescription>
                Rolling 72-hour activity curve.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
                      Peak hourly count
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[#132118]">
                      {formatCount(Math.max(...(velocityValues.length ? velocityValues : [0])))}
                    </div>
                  </div>
                  <div className="text-right text-sm text-[#6b786d]">
                    {velocityValues.length
                      ? `${velocityValues.length} hourly buckets`
                      : "No buckets yet"}
                  </div>
                </div>
                <div className="mt-4 h-36">
                  <LineChart
                    values={velocityValues}
                    stroke="rgb(18 148 32)"
                    fill="rgba(180, 218, 167, 0.34)"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
