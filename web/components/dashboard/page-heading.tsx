import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex max-w-full flex-col gap-5 overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] px-4 py-5 sm:px-5 sm:py-6 md:flex-row md:items-end md:justify-between md:rounded-[32px] md:px-6">
      <div className="min-w-0 max-w-3xl space-y-3">
        <Badge variant="outline" className="w-fit text-cyan-100">
          {eyebrow}
        </Badge>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-300/82 md:text-base">
            {description}
          </p>
        </div>
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-col gap-3 [&>*]:w-full sm:flex-row sm:flex-wrap sm:[&>*]:w-auto md:w-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
