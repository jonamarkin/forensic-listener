import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.12em]",
  {
    variants: {
      variant: {
        default: "border-[#dbe3d8] bg-[#eef1ea] text-[#4d5a50]",
        success: "border-[#bed7b6] bg-[#e0edd8] text-[#2b6631]",
        warning: "border-[#e6d3a2] bg-[#f4ead0] text-[#8a6732]",
        danger: "border-[#e9b8b3] bg-[#f5d9d7] text-[#933f34]",
        outline: "border-[#dbe3d8] bg-transparent text-[#4d5a50]",
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
