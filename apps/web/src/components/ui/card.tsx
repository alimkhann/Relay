import type { HTMLAttributes } from "react"

import { cn } from "@/lib/cn"

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[28px] border border-white/50 bg-white/70 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.35)] backdrop-blur", className)}
      {...props}
    />
  )
}
