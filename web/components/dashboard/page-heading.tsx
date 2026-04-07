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
    <div className="flex max-w-full flex-col gap-5 overflow-hidden rounded-[30px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(251,252,248,0.92),rgba(242,246,236,0.96))] px-5 py-6 sm:px-6 md:flex-row md:items-end md:justify-between md:px-7">
      <div className="min-w-0 max-w-3xl space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#6a7a6f]">
          {eyebrow}
        </p>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#132118] sm:text-3xl md:text-[2.1rem]">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#58645c] md:text-[15px]">
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
