import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[20px] text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:ring-[var(--ring)] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_12px_30px_rgba(18,148,32,0.16)] hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--primary)_90%,white)]",
        secondary:
          "border border-[color:var(--border)] bg-white/82 text-[var(--secondary-foreground)] shadow-[0_8px_24px_rgba(18,41,23,0.04)] hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--secondary)_78%,white)]",
        ghost: "text-[#2f3f35] hover:bg-[#e7eee0]",
        outline:
          "border border-[color:var(--border)] bg-transparent text-[#223228] hover:border-[#9cc48d] hover:bg-[#edf4e8]",
      },
      size: {
        default: "h-11 px-4.5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-5.5 text-sm",
        icon: "size-11 rounded-[20px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
