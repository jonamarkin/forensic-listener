import { CasesSurface } from "@/components/dashboard/cases-surface";
import { maybeApiFetch } from "@/lib/api";
import type { InvestigationCaseSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const cases =
    (await maybeApiFetch<InvestigationCaseSummary[]>("/cases?limit=24")) || [];

  return <CasesSurface initialCases={cases} />;
}
