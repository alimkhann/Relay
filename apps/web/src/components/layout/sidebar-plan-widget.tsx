"use client"

import * as Tooltip from "@radix-ui/react-tooltip"
import { Zap } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/cn"

interface SidebarPlanWidgetProps {
  plan: string
  isPaid: boolean
  capturesUsed: number
  capturesLimit: number
  collapsed: boolean
}

export function SidebarPlanWidget({ plan, isPaid, capturesUsed, capturesLimit, collapsed }: SidebarPlanWidgetProps) {
  const ratio = capturesLimit > 0 ? capturesUsed / capturesLimit : 0
  const barColor = ratio >= 0.95 ? "bg-red-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500"
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)

  if (collapsed) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Link
            href="/settings?section=billing"
            className="flex items-center justify-center rounded-[var(--relay-radius-sm)] p-2 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          >
            <Zap className="h-4 w-4 shrink-0" />
          </Link>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="z-50 max-w-[200px] rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-3 py-2 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
          >
            <p>{planLabel} plan</p>
            <p className="mt-0.5 text-[var(--relay-bg)]/70">
              {capturesUsed}/{capturesLimit} captures
            </p>
            <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }

  return (
    <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-soft)]/50 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--relay-faint)]">
          <Zap className="h-3 w-3" />
          {planLabel}
        </span>
        {!isPaid && (
          <Link
            href="/settings?section=billing"
            className="text-[10px] font-semibold text-[var(--relay-accent)] transition-colors hover:text-[var(--relay-accent)]/80"
          >
            Upgrade
          </Link>
        )}
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[var(--relay-muted)]">Captures</span>
          <span className="tabular-nums text-[var(--relay-muted)]">
            {capturesUsed}
            <span className="text-[var(--relay-faint)]">/{capturesLimit}</span>
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--relay-line)]">
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${Math.min(ratio * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
