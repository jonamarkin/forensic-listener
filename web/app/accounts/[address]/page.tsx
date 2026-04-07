import Link from "next/link";
import { ArrowRight, Brain, FileCode2, Waves } from "lucide-react";

import { CaseWorkbench } from "@/components/dashboard/case-workbench";
import { LineChart } from "@/components/dashboard/line-chart";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { maybeApiFetch } from "@/lib/api";
import type {
  AccountBehaviorProfile,
  AccountProfile,
  AccountVelocityPoint,
  InvestigationCaseSummary,
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

export default async function AccountPage({
  params,
}: {
  params: RouteParams;
}) {
  const { address } = await params;

  const [profile, behavior, similarAccounts, velocity, caseCatalog] = await Promise.all([
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
    maybeApiFetch<InvestigationCaseSummary[]>("/cases?limit=24"),
  ]);

  if (!profile) {
    return (
      <div className="space-y-6 pb-10">
        <PageHeading
          eyebrow="Account Dossier"
          title="Address not found."
          description="The requested address is not available from the forensic backend right now."
        />
      </div>
    );
  }

  const topFeatures = Object.entries(behavior?.features || {})
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 6);
  const velocityValues = (velocity || []).map((point) => point.total_count);

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Account Dossier"
        title={profile.entity_name || formatAddress(profile.address, 10)}
        description="This page concentrates the investigative dossier around one address: profile, counterparties, behavior signature, velocity, notes, and entity context."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/graph?address=${encodeURIComponent(profile.address)}&depth=2`}>
                Trace in graph
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {profile.is_contract ? (
              <Button asChild>
                <Link href={`/contracts/${encodeURIComponent(profile.address)}`}>
                  Open contract intelligence
                  <FileCode2 className="size-4" />
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <section className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={entityTone(profile.entity_type)}>
                {profile.entity_type || (profile.is_contract ? "contract" : "wallet")}
              </Badge>
              <Badge className={riskTone(profile.risk_level)}>
                {profile.risk_level || "observed"}
              </Badge>
              {profile.is_hub ? <Badge variant="outline">hub</Badge> : null}
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
                  Balance
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#132118]">
                  {formatWeiToEth(profile.balance)}
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
                  Total tx
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#132118]">
                  {formatCount(profile.total_count)}
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
                  Sent
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#132118]">
                  {formatWeiToEth(profile.total_sent)}
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7b887d]">
                  Received
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#132118]">
                  {formatWeiToEth(profile.total_received)}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4">
                <div className="text-sm font-semibold text-[#132118]">Lifecycle</div>
                <div className="mt-3 space-y-2 text-sm text-[#556357]">
                  <div>First seen: {formatDateTime(profile.first_seen)}</div>
                  <div>Last seen: {formatDateTime(profile.last_seen)}</div>
                  <div>Sent count: {formatCount(profile.sent_count)}</div>
                  <div>Received count: {formatCount(profile.received_count)}</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dbe3d8] bg-white/82 p-4">
                <div className="text-sm font-semibold text-[#132118]">Risk posture</div>
                <div className="mt-3 space-y-2 text-sm text-[#556357]">
                  <div>Flags: {formatCount(profile.flag_count)}</div>
                  <div>
                    High-severity flags: {formatCount(profile.high_severity_flag_count)}
                  </div>
                  <div>Entity name: {profile.entity_name || "Unlabeled"}</div>
                  <div>Address: {profile.address}</div>
                </div>
              </div>
            </div>

            <Card className="border-[#dbe3d8] bg-[#fdfefb] shadow-none">
              <CardHeader>
                <CardTitle className="text-[#132118]">Counterparties</CardTitle>
                <CardDescription>
                  The addresses this entity moves with most often.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.counterparties.length ? (
                  profile.counterparties.slice(0, 8).map((counterparty) => (
                    <Link
                      key={counterparty.address}
                      href={`/accounts/${encodeURIComponent(counterparty.address)}`}
                      className="block rounded-[22px] border border-[#dbe3d8] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#132118]">
                            {counterparty.entity_name ||
                              formatAddress(counterparty.address, 7)}
                          </div>
                          <div className="mt-1 text-sm text-[#5d6a60]">
                            {counterparty.entity_type || "wallet"} ·{" "}
                            {formatCount(counterparty.total_count)} interactions
                          </div>
                        </div>
                        <Badge className={riskTone(counterparty.risk_level)}>
                          {counterparty.risk_level || "observed"}
                        </Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-[#6f7b72]">
                    No counterparties available yet for this address.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#dbe3d8] bg-[#fdfefb] shadow-none">
              <CardHeader>
                <CardTitle className="text-[#132118]">Recent transactions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 overflow-x-hidden">
                {profile.recent_transactions.length ? (
                  profile.recent_transactions.slice(0, 8).map((tx) => (
                    <Link
                      key={tx.hash}
                      href={`/transactions/${encodeURIComponent(tx.hash)}`}
                      className="block w-full min-w-0 rounded-[22px] border border-[#dbe3d8] bg-white p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                    >
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs text-[#2b6631] [overflow-wrap:anywhere]">
                            {formatAddress(tx.hash, 10)}
                          </div>
                          <div className="mt-2 text-sm text-[#5d6a60] [overflow-wrap:anywhere]">
                            {formatAddress(tx.from, 7)} →{" "}
                            {tx.to ? formatAddress(tx.to, 7) : "contract creation"}
                          </div>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <div className="text-sm font-semibold text-[#132118]">
                            {formatWeiToEth(tx.value)}
                          </div>
                          <div className="mt-1 text-xs text-[#76857a]">
                            {formatDateTime(tx.timestamp)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-[#6f7b72]">
                    No recent transaction slice is available yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Brain className="size-5" />
                <CardTitle className="text-[#132118]">Behavior matcher</CardTitle>
              </div>
              <CardDescription>
                Feature profile and nearest-neighbor matches from pgvector.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {behavior ? (
                <>
                  <div className="rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                    <div className="text-sm text-[#556357]">
                      Sample size {formatCount(behavior.sample_size)} · updated{" "}
                      {formatDateTime(behavior.updated_at)}
                    </div>
                    <div className="mt-4 grid gap-3">
                      {topFeatures.map(([name, value]) => (
                        <div key={name}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[#556357]">
                              {name.replace(/_/g, " ")}
                            </span>
                            <span className="font-semibold text-[#132118]">
                              {value.toFixed(3)}
                            </span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[#dce7d7]">
                            <div
                              className="h-2 rounded-full bg-[#129420]"
                              style={{
                                width: `${Math.min(100, Math.abs(value) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(similarAccounts || []).length ? (
                      similarAccounts!.map((match) => (
                        <Link
                          key={match.address}
                          href={`/accounts/${encodeURIComponent(match.address)}`}
                          className="block rounded-[22px] border border-[#dbe3d8] bg-white/82 p-4 transition hover:border-[#b4cda8] hover:bg-[#f6faf1]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-[#132118]">
                                {match.entity_name ||
                                  formatAddress(match.address, 7)}
                              </div>
                              <div className="mt-1 text-sm text-[#5d6a60]">
                                {match.highlights.join(" · ")}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-semibold text-[#132118]">
                                {formatSimilarity(match.similarity)}
                              </div>
                              <div className="text-xs text-[#76857a]">similarity</div>
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <p className="text-sm text-[#6f7b72]">
                        No nearby behavioral neighbors available yet.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[#6f7b72]">
                  Behavior vectors are not available for this address yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-[#2b6631]">
                <Waves className="size-5" />
                <CardTitle className="text-[#132118]">Velocity</CardTitle>
              </div>
              <CardDescription>
                Time-bucketed activity for anomaly context and burst detection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-[210px] rounded-[24px] border border-[#dbe3d8] bg-[#f6f9f3] p-4">
                <LineChart values={velocityValues} stroke="rgb(16 185 129)" fill="rgba(16, 185, 129, 0.15)" />
              </div>
              <div className="grid gap-3">
                {(velocity || []).slice(-4).map((point) => (
                  <div
                    key={point.bucket}
                    className="rounded-[22px] border border-[#dbe3d8] bg-white/82 p-4"
                  >
                    <div className="text-sm font-semibold text-[#132118]">
                      {formatDateTime(point.bucket)}
                    </div>
                    <div className="mt-1 text-sm text-[#5d6a60]">
                      {formatCount(point.total_count)} tx · {formatWeiToEth(point.total_value)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <CaseWorkbench
            address={profile.address}
            initialNotes={profile.notes}
            initialTags={profile.tags}
            initialCases={profile.cases}
            availableCases={caseCatalog || []}
          />
        </div>
      </section>
    </div>
  );
}
