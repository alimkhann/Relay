"use client"

import { motion } from "motion/react"
import { ArrowDown, CheckCircle2, PencilLine, Trash2, Undo2 } from "lucide-react"

import type { AssistantActionItem, AssistantActionPreview, AssistantActionResult } from "@relay/shared"

import { cn } from "@/lib/cn"

import { toolIcon } from "./tool-icons"

const LIFECYCLE_PILL: Record<
  NonNullable<AssistantActionItem["lifecycle"]>,
  { label: string; classes: string }
> = {
  active: {
    label: "active",
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  cooling: {
    label: "cooling",
    classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  archived: {
    label: "archived",
    classes: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  },
  forgotten: {
    label: "forgotten",
    classes: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
}

const ACTION_META: Record<
  AssistantActionResult["action"],
  { Icon: typeof CheckCircle2; tone: string; verb: string }
> = {
  created: {
    Icon: CheckCircle2,
    tone: "text-[var(--relay-accent-blue)]",
    verb: "Created"
  },
  updated: { Icon: PencilLine, tone: "text-amber-600 dark:text-amber-400", verb: "Updated" },
  deleted: { Icon: Trash2, tone: "text-[var(--relay-danger)]", verb: "Deleted" },
  read: { Icon: CheckCircle2, tone: "text-[var(--relay-muted)]", verb: "Read" }
}

function PreviewItem({
  item,
  deleted = false,
}: {
  item: AssistantActionItem
  deleted?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-3 py-2",
        deleted && "border-[var(--relay-danger)]/50 bg-[var(--relay-danger)]/5",
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--relay-muted)]">
        {item.type ? <span>{item.type}</span> : null}
        {item.personalCategory ? <span>· {item.personalCategory}</span> : null}
      </div>
      <p
        className={cn(
          "mt-1 whitespace-pre-wrap text-xs text-[var(--relay-ink)]",
          deleted && "text-[var(--relay-muted)] line-through",
        )}
      >
        {item.content ?? item.label}
      </p>
    </div>
  )
}

function previewItemsEqual(
  before: AssistantActionItem,
  after: AssistantActionItem,
): boolean {
  return (
    (before.content ?? before.label) === (after.content ?? after.label) &&
    (before.title ?? "") === (after.title ?? "")
  )
}

export function MemoryActionPreview({ preview }: { preview: AssistantActionPreview }) {
  if (preview.before && preview.after) {
    if (previewItemsEqual(preview.before, preview.after)) {
      return <PreviewItem item={preview.after} />
    }
    return (
      <div className="space-y-1.5">
        <PreviewItem item={preview.before} />
        <ArrowDown className="mx-auto size-3.5 text-[var(--relay-muted)]" />
        <PreviewItem item={preview.after} />
      </div>
    )
  }
  if (preview.before) return <PreviewItem item={preview.before} deleted />
  if (preview.after) return <PreviewItem item={preview.after} />
  return null
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
  const ToolGlyph = toolIcon(result.tool)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-soft)]/60 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-2 text-sm font-semibold", meta.tone)}>
          <span className="grid size-6 place-items-center rounded-[var(--relay-radius)] bg-[var(--relay-accent-blue-soft)] text-[var(--relay-accent-blue)]">
            <ToolGlyph className="size-3.5" />
          </span>
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
        ) : result.irreversible ? (
          <span className="text-xs text-[var(--relay-muted)]">Can&apos;t be undone</span>
        ) : null}
      </div>
      {result.items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {result.items.slice(0, 5).map((item, i) => {
            // web_search items carry the cited URL in `id`; render those as
            // external links so users can verify what the agent grounded on.
            const isUrl =
              typeof item.id === "string" && /^https?:\/\//i.test(item.id)
            const pill = item.lifecycle ? LIFECYCLE_PILL[item.lifecycle] : null
            return (
              <li
                key={item.id ?? i}
                className="flex items-center gap-2 text-xs text-[var(--relay-ink-secondary)]"
              >
                <span className="text-[var(--relay-muted)]">—</span>
                {isUrl ? (
                  <a
                    href={item.id}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[var(--relay-accent-blue)] hover:underline"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className="truncate">{item.label}</span>
                )}
                {pill ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      pill.classes,
                    )}
                  >
                    {pill.label}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {result.previews && result.previews.length > 0 ? (
        <div className="mt-2 space-y-2">
          {result.previews.slice(0, 3).map((preview, index) => (
            <MemoryActionPreview key={index} preview={preview} />
          ))}
        </div>
      ) : null}
    </motion.div>
  )
}
