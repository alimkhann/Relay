"use client"

import { motion } from "motion/react"
import { CheckCircle2, PencilLine, Trash2, Undo2 } from "lucide-react"

import type { AssistantActionResult } from "@relay/shared"

import { cn } from "@/lib/cn"

const ACTION_META: Record<
  AssistantActionResult["action"],
  { Icon: typeof CheckCircle2; tone: string; verb: string }
> = {
  created: { Icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", verb: "Created" },
  updated: { Icon: PencilLine, tone: "text-amber-600 dark:text-amber-400", verb: "Updated" },
  deleted: { Icon: Trash2, tone: "text-[var(--relay-danger)]", verb: "Deleted" },
  read: { Icon: CheckCircle2, tone: "text-[var(--relay-muted)]", verb: "Read" }
}

export function ActionResultCard({
  result,
  onUndo
}: {
  result: AssistantActionResult
  onUndo?: (result: AssistantActionResult) => void
}) {
  const meta = ACTION_META[result.action] ?? ACTION_META.read
  const { Icon } = meta

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-soft)]/60 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-1.5 text-sm font-semibold", meta.tone)}>
          <Icon className="size-4" />
          <span>
            {meta.verb} {result.count} {result.entity}
            {result.count === 1 ? "" : "s"}
          </span>
        </div>
        {result.undoRef && onUndo ? (
          <button
            type="button"
            onClick={() => onUndo(result)}
            className="flex items-center gap-1 text-xs text-[var(--relay-muted)] transition-colors hover:text-[var(--relay-ink)]"
          >
            <Undo2 className="size-3.5" />
            Undo
          </button>
        ) : null}
      </div>
      {result.items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {result.items.slice(0, 5).map((item, i) => (
            <li
              key={item.id ?? i}
              className="flex gap-2 text-xs text-[var(--relay-ink-secondary)]"
            >
              <span className="text-[var(--relay-muted)]">—</span>
              <span className="truncate">{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  )
}
