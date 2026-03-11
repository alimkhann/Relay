import type { HTMLAttributes } from "react"

import { cn } from "@/lib/cn"

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[18px] border border-[var(--relay-line)] bg-white/78 shadow-[var(--relay-shadow)] backdrop-blur", className)}
      {...props}
    />
  )
}
