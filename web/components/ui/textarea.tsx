import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
        <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-[26px] border border-[#d7e2d0] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,249,244,0.96))] px-4 py-3 text-sm text-[#132118] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none placeholder:text-[#78867a] focus:border-[#97bf89] focus:ring-2 focus:ring-[#d5e8ce] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
