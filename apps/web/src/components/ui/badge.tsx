import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--relay-accent)] px-2.5 py-0.5 text-[11px] font-medium tracking-wider text-[var(--relay-accent-text)]",
        className,
      )}
      {...props}
    />
  );
}
