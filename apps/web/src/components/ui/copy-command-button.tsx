"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/cn"

export function CopyCommandButton({
  value,
  className,
  label = "Copy",
}: {
  value: string
  className?: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--relay-line)] bg-[var(--relay-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--relay-muted)] transition-colors hover:border-[var(--relay-line-strong)] hover:text-[var(--relay-ink)]",
        className,
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  )
}
