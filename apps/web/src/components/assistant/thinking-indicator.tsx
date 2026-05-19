"use client"

import { motion } from "motion/react"

import { toolIcon } from "./tool-icons"

export function ThinkingIndicator({ label, tool }: { label?: string; tool?: string | null }) {
  const Icon = toolIcon(tool)
  const text = label ?? "Thinking…"

  return (
    <div className="flex items-center gap-2 px-1 py-1 text-xs font-medium text-[var(--relay-muted)]">
      <motion.span
        className="grid size-5 place-items-center rounded-full bg-[var(--relay-accent-blue-soft)] text-[var(--relay-accent-blue)]"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon className="size-3" />
      </motion.span>
      <span className="relative bg-[linear-gradient(100deg,var(--relay-muted)_30%,var(--relay-ink)_50%,var(--relay-muted)_70%)] bg-[length:200%_auto] bg-clip-text text-transparent [animation:relay-shimmer_2.4s_linear_infinite]">
        {text}
      </span>
    </div>
  )
}
