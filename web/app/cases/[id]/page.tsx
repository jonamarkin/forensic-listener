import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CaseDetailSurface } from "@/components/dashboard/case-detail-surface";
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
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
              Case Detail
            </p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                Case not found.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[#59675d]">
                The requested investigation case is not available from the forensic
                backend right now.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href="/cases">
              Back to cases
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c796f]">
            Case Detail
          </p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#d7e2d0] bg-[#f7faf4] px-3 py-1 text-xs font-medium text-[#2b6631]">
                Investigation case
              </span>
              <span className="rounded-full border border-[#d7e2d0] bg-white/80 px-3 py-1 text-xs font-medium text-[#58665a]">
                #{detail.id}
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#132118] sm:text-4xl">
                {detail.title}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[#59675d]">
                {detail.summary ||
                  "This case groups the addresses, linked flags, and investigative metadata required to work the incident as saved analyst state."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
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
        </div>
      </section>

      <CaseDetailSurface initialCase={detail} />
    </div>
  );
}
