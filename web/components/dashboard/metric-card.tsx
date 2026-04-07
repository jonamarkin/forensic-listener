import type { ReactNode } from "react";

import { ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({
  eyebrow,
  value,
  description,
  accent,
  footer,
}: {
  eyebrow: string;
  value: string;
  description: string;
  accent: ReactNode;
  footer?: string;
}) {
  return (
    <Card className="w-full min-w-0 max-w-full overflow-hidden">
      <CardHeader className="flex flex-col items-start justify-between gap-4 pb-4 sm:flex-row">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6a7a6f]">
            {eyebrow}
          </p>
          <CardTitle className="mt-3 text-[2rem] text-[#132118]">{value}</CardTitle>
        </div>
        <div className="rounded-2xl border border-[#dbe3d8] bg-[#edf4e8] p-3 text-[#2d5d31]">
          {accent}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="break-words [overflow-wrap:anywhere] text-sm leading-6 text-[#58645c]">
          {description}
        </p>
        {footer ? (
          <div className="flex w-full items-start gap-2 rounded-2xl border border-[#dbe3d8] bg-[#f3f6ee] px-3 py-2 text-xs leading-5 text-[#58645c] sm:inline-flex sm:w-auto sm:items-center sm:rounded-full sm:py-1">
            <ArrowUpRight className="size-3.5 text-[#2e7136]" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              {footer}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
