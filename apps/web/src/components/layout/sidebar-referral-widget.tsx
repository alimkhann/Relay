"use client"

import { useState } from "react"
import { Copy, Check, Gift } from "lucide-react"
import * as Tooltip from "@radix-ui/react-tooltip"

import { cn } from "@/lib/cn"

const TIERS = [
  { count: 1, label: "25%", pct: 33 },
  { count: 3, label: "50%", pct: 66 },
  { count: 5, label: "100%", pct: 100 },
] as const

interface SidebarReferralWidgetProps {
  code: string
  link: string
  qualifiedCount: number
  collapsed: boolean
}

export function SidebarReferralWidget({ code, link, qualifiedCount, collapsed }: SidebarReferralWidgetProps) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentTier = TIERS.filter((t) => qualifiedCount >= t.count).pop()
  const nextTier = TIERS.find((t) => qualifiedCount < t.count)
  const progressPct = currentTier ? currentTier.pct : 0
  const discountLabel = currentTier ? currentTier.label : "0%"

  if (collapsed) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={copy}
            className="flex items-center justify-center rounded-[var(--relay-radius-sm)] p-2 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          >
            <Gift className="h-4 w-4 shrink-0" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="z-50 max-w-[200px] rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-3 py-2 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
          >
            <p>Referrals: {qualifiedCount} qualified</p>
            <p className="mt-0.5 text-[var(--relay-bg)]/70">Discount: {discountLabel}</p>
            <p className="mt-0.5 text-[var(--relay-bg)]/70">Click to copy link</p>
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
          <Gift className="h-3 w-3" />
          Referrals
        </span>
        <button
          onClick={copy}
          className={cn(
            "flex items-center gap-1 rounded-[var(--relay-radius-sm)] px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            copied
              ? "text-emerald-500"
              : "text-[var(--relay-muted)] hover:text-[var(--relay-ink)]",
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-2 flex items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--relay-line)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--relay-accent)] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
          {/* Tier markers */}
          {TIERS.map((tier) => (
            <div
              key={tier.count}
              className={cn(
                "absolute top-1/2 h-2.5 w-px -translate-y-1/2",
                qualifiedCount >= tier.count ? "bg-[var(--relay-accent)]" : "bg-[var(--relay-muted)]/30",
              )}
              style={{ left: `${tier.pct}%` }}
            />
          ))}
        </div>
        <span className="text-[11px] font-semibold text-[var(--relay-ink)] tabular-nums">
          {discountLabel}
        </span>
      </div>

      {/* Tier labels */}
      <div className="mt-1.5 flex justify-between text-[10px] text-[var(--relay-faint)]">
        {TIERS.map((tier) => (
          <span
            key={tier.count}
            className={cn(
              "tabular-nums",
              qualifiedCount >= tier.count && "text-[var(--relay-accent)] font-medium",
            )}
          >
            {tier.count}→{tier.label}
          </span>
        ))}
      </div>

      {/* Status line */}
      <p className="mt-1.5 text-[11px] text-[var(--relay-muted)]">
        {qualifiedCount === 0
          ? "Invite friends to earn discounts"
          : nextTier
            ? `${qualifiedCount} qualified · ${nextTier.count - qualifiedCount} more for ${nextTier.label}`
            : `${qualifiedCount} qualified · max tier reached`}
      </p>
    </div>
  )
}
