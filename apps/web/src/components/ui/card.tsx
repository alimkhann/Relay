import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-t border-[var(--relay-line)] py-10",
        className,
      )}
      {...props}
    />
  );
}
