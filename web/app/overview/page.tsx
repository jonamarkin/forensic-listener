import { OverviewLiveSurface } from "@/components/dashboard/overview-live-surface";
import { apiResult } from "@/lib/api";
import type { AddressActivity, NetworkMetricPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [topAddresses, networkMetrics] = await Promise.all([
    apiResult<AddressActivity[]>("/addresses/top?limit=6"),
    apiResult<NetworkMetricPoint[]>("/stats/network?hours=24"),
  ]);

  return (
    <OverviewLiveSurface
      initialTopAddresses={topAddresses.data ?? []}
      initialNetworkMetrics={networkMetrics.data ?? []}
      apiError={topAddresses.error ?? networkMetrics.error}
    />
  );
}
