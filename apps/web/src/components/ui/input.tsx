import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-md border border-[var(--nx-line)] bg-white/80 px-3 py-2 text-sm text-[var(--nx-ink)] placeholder:text-[var(--nx-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nx-accent)] disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
