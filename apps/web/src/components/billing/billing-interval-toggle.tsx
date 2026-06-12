"use client"

import { cn } from "@/lib/cn"

export type BillingInterval = "month" | "year"

type BillingIntervalToggleProps = {
  interval: BillingInterval
  onChange: (interval: BillingInterval) => void
  /** Marketing dark theme vs dashboard relay tokens */
  variant?: "marketing" | "dashboard"
  size?: "sm" | "md"
  className?: string
  onToggle?: (next: BillingInterval) => void
}

export function BillingIntervalToggle({
  interval,
  onChange,
  variant = "dashboard",
  size = "md",
  className,
  onToggle,
}: BillingIntervalToggleProps) {
  const yearly = interval === "year"

  function toggle() {
    const next: BillingInterval = yearly ? "month" : "year"
    onChange(next)
    onToggle?.(next)
  }

  const labelClass = cn(
    "transition-colors",
    size === "sm" ? "text-xs" : variant === "marketing" ? "text-sm" : "text-[13px] font-medium",
  )

  const trackClass = cn(
    "relative shrink-0 rounded-full transition-colors",
    size === "sm" ? "h-5 w-9" : "h-6 w-11",
    variant === "marketing"
      ? yearly
        ? "bg-white/20"
        : "bg-white/10"
      : yearly
        ? "bg-[var(--relay-accent)]"
        : "bg-[var(--relay-line-strong)]",
  )

  const thumbClass = cn(
    "absolute top-0.5 rounded-full transition-[left] duration-200 ease-out",
    size === "sm" ? "h-4 w-4" : "h-5 w-5",
    variant === "marketing" ? "bg-white" : "bg-[var(--relay-bg)]",
    yearly
      ? size === "sm"
        ? "left-[18px]"
        : "left-[22px]"
      : "left-0.5",
  )

  const activeLabel =
    variant === "marketing"
      ? "text-white/80"
      : "text-[var(--relay-ink)]"
  const mutedLabel =
    variant === "marketing"
      ? "text-white/35"
      : "text-[var(--relay-muted)]"
  const discountActive =
    variant === "marketing" ? "text-emerald-400/60" : "text-emerald-500"
  const discountMuted =
    variant === "marketing" ? "text-white/25" : "text-[var(--relay-faint)]"

  return (
    <div className={cn("flex items-center justify-center gap-3", className)}>
      <span className={cn(labelClass, !yearly ? activeLabel : mutedLabel)}>Monthly</span>
      <button
        type="button"
        aria-label="Toggle billing interval"
        aria-pressed={yearly}
        onClick={toggle}
        className={trackClass}
      >
        <span className={thumbClass} />
      </button>
      <span className={cn(labelClass, yearly ? activeLabel : mutedLabel)}>
        Yearly{" "}
        <span className={cn("font-medium", yearly ? discountActive : discountMuted)}>-17%</span>
      </span>
    </div>
  )
}