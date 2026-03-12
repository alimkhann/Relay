import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] shadow-[var(--relay-shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}
