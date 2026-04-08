import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[20px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(247,249,244,0.92))] px-4 py-2 text-sm text-[#152319] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none placeholder:text-[#718075] focus:border-[#9bc58b] focus:ring-2 focus:ring-[#dbeace] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
