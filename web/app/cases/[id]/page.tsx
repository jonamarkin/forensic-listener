import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CaseDetailSurface } from "@/components/dashboard/case-detail-surface";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Button } from "@/components/ui/button";
import { maybeApiFetch } from "@/lib/api";
import type { InvestigationCaseDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{
  id: string;
}>;

export default async function CaseDetailPage({
  params,
}: {
  params: RouteParams;
}) {
  const { id } = await params;
  const detail = await maybeApiFetch<InvestigationCaseDetail>(`/cases/${id}`);

  if (!detail) {
    return (
      <div className="space-y-6 pb-10">
        <PageHeading
          eyebrow="Cases"
          title="Case not found."
          description="The requested investigation case is not available from the forensic backend right now."
          actions={
            <Button asChild variant="secondary">
              <Link href="/cases">
                Back to cases
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeading
        eyebrow="Case Detail"
        title={detail.title}
        description={
          detail.summary ||
          "This case groups the addresses, linked flags, and investigative metadata required to work the incident as saved analyst state."
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/cases">
                Back to cases
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link
                href={`/api/forensic/cases/${encodeURIComponent(detail.id.toString())}/report?format=markdown`}
                target="_blank"
              >
                Export case report
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/alerts">
                Review alert queue
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <CaseDetailSurface initialCase={detail} />
    </div>
  );
}
