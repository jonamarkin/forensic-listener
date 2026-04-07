import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em]",
  {
    variants: {
      variant: {
        default: "border-white/10 bg-white/5 text-slate-100",
        success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
        warning: "border-amber-400/30 bg-amber-500/15 text-amber-100",
        danger: "border-rose-400/30 bg-rose-500/15 text-rose-100",
        outline: "border-white/12 bg-transparent text-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
