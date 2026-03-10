import type { HTMLAttributes } from "react"

import { cn } from "@/lib/cn"

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-stone-950/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-stone-50",
        className
      )}
      {...props}
    />
  )
}
