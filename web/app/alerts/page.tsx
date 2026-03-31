import { AlertsLiveSurface } from "@/components/dashboard/alerts-live-surface";
import { maybeApiFetch } from "@/lib/api";
import type {
  CircularFlow,
  ForensicFlag,
  InvestigationCaseSummary,
  NetworkMetricPoint,
  VelocityAlert,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const [velocityAlerts, circularFlows, recentFlags, networkMetrics, cases] = await Promise.all([
    maybeApiFetch<VelocityAlert[]>("/alerts/velocity?limit=10"),
    maybeApiFetch<CircularFlow[]>("/forensics/circular?limit=8"),
    maybeApiFetch<ForensicFlag[]>("/flags?limit=10"),
    maybeApiFetch<NetworkMetricPoint[]>("/stats/network?hours=24&bucket=hour"),
    maybeApiFetch<InvestigationCaseSummary[]>("/cases?limit=30"),
  ]);

  return (
    <AlertsLiveSurface
      initialVelocityAlerts={velocityAlerts || []}
      initialCircularFlows={circularFlows || []}
      initialRecentFlags={recentFlags || []}
      initialNetworkMetrics={networkMetrics || []}
      initialCases={cases || []}
    />
  );
}
