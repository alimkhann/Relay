"use client"

import { motion } from "motion/react"

export function ThinkingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-xs text-[var(--relay-muted)]">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full bg-current"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span>{label ?? "Thinking…"}</span>
    </div>
  )
}
