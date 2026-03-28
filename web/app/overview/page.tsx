import { OverviewLiveSurface } from "@/components/dashboard/overview-live-surface";
import { maybeApiFetch } from "@/lib/api";
import type {
  AddressActivity,
  ContractSummary,
  EnrichmentStatus,
  ForensicFlag,
  NetworkMetricPoint,
  OverviewStats,
  Transaction,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [
    overview,
    enrichment,
    topAddresses,
    recentTransactions,
    recentFlags,
    recentContracts,
    networkMetrics,
  ] = await Promise.all([
    maybeApiFetch<OverviewStats>("/stats/overview"),
    maybeApiFetch<EnrichmentStatus>("/stats/enrichment"),
    maybeApiFetch<AddressActivity[]>("/addresses/top?limit=6"),
    maybeApiFetch<Transaction[]>("/transactions?limit=8"),
    maybeApiFetch<ForensicFlag[]>("/flags?limit=6"),
    maybeApiFetch<ContractSummary[]>("/contracts/recent?limit=6"),
    maybeApiFetch<NetworkMetricPoint[]>("/stats/network?hours=24&bucket=hour"),
  ]);

  return (
    <OverviewLiveSurface
      initialOverview={overview}
      initialEnrichment={enrichment}
      initialTopAddresses={topAddresses || []}
      initialRecentTransactions={recentTransactions || []}
      initialRecentFlags={recentFlags || []}
      initialRecentContracts={recentContracts || []}
      initialNetworkMetrics={networkMetrics || []}
    />
  );
}
