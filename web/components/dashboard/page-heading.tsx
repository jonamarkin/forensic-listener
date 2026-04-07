import type { ReactNode } from "react";

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
    <div className="flex max-w-full flex-col gap-5 overflow-hidden rounded-[24px] border border-white/8 bg-slate-950/30 px-4 py-5 sm:px-5 sm:py-6 md:flex-row md:items-end md:justify-between md:px-6">
      <div className="min-w-0 max-w-3xl space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200/72">
          {eyebrow}
        </p>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300/78 md:text-[15px]">
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
