import { AlertsLiveSurface } from "@/components/dashboard/alerts-live-surface";
import { maybeApiFetch } from "@/lib/api";
import type {
  CircularFlow,
  ForensicFlag,
  NetworkMetricPoint,
  VelocityAlert,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const [velocityAlerts, circularFlows, recentFlags, networkMetrics] = await Promise.all([
    maybeApiFetch<VelocityAlert[]>("/alerts/velocity?limit=10"),
    maybeApiFetch<CircularFlow[]>("/forensics/circular?limit=8"),
    maybeApiFetch<ForensicFlag[]>("/flags?limit=10"),
    maybeApiFetch<NetworkMetricPoint[]>("/stats/network?hours=24&bucket=hour"),
  ]);

  return (
    <AlertsLiveSurface
      initialVelocityAlerts={velocityAlerts || []}
      initialCircularFlows={circularFlows || []}
      initialRecentFlags={recentFlags || []}
      initialNetworkMetrics={networkMetrics || []}
    />
  );
}
