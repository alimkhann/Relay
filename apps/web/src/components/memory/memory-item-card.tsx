"use client"

import { useState } from "react"
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Globe,
  MessageSquare,
  Pencil,
  Pin,
  Plug,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react"

import type { MemoryItemDto, MemoryItemType, SourceSurface } from "@relay/shared"
import { PERSONAL_CATEGORY_META, personalCategoryFromMetadata } from "@relay/shared/constants/memory-taxonomy"

import { cn } from "@/lib/cn"
import { Markdown } from "@/components/markdown"
import { formatRelativeTime } from "@/features/activity/activity-feed"

/**
 * Single source of truth for a memory item card.
 *
 * Used by:
 *   - dashboard memory list (MemoryItemsList)
 *   - personal-space page
 *   - governance section (decisions/tasks/constraints)
 *   - (later) extension side-panel via a CSS-modules port
 *
 * The card carries a left-edge color stripe keyed off the item's `type` so
 * the user keeps a visual cue when they filter to a single memory type tab.
 * Actions are icon-only (Pencil / Trash2 / ChevronDown) with aria-labels.
 */

const ORIGIN_META: Record<
  SourceSurface,
  { label: string; Icon: typeof Sparkles }
> = {
  ask_relay: { label: "Ask Relay", Icon: Sparkles },
  extension: { label: "Extension", Icon: Plug },
  chatgpt: { label: "ChatGPT", Icon: MessageSquare },
  claude: { label: "Claude", Icon: MessageSquare },
  gemini: { label: "Gemini", Icon: MessageSquare },
  grok: { label: "Grok", Icon: MessageSquare },
  perplexity: { label: "Perplexity", Icon: MessageSquare },
  deepseek: { label: "DeepSeek", Icon: MessageSquare },
  codex: { label: "Codex", Icon: Terminal },
  mcp: { label: "MCP", Icon: Terminal },
  api: { label: "API", Icon: Boxes },
  web: { label: "Web", Icon: Globe },
  manual: { label: "Manual", Icon: Pencil },
}

const TYPE_ACCENT: Record<MemoryItemType, string> = {
  decision: "bg-[var(--relay-accent-blue)]",
  task: "bg-amber-500",
  constraint: "bg-rose-500",
  requirement: "bg-red-500",
  note: "bg-zinc-400 dark:bg-zinc-500",
  artifact: "bg-violet-500",
}

function OriginBadge({ surface }: { surface: SourceSurface | null }) {
  // Untracked surface → treat as a manual/user save so every item is badged.
  const meta = (surface ? ORIGIN_META[surface] : null) ?? ORIGIN_META.manual
  const Icon = meta.Icon
  const label = meta.label
  const isAssistant = surface === "ask_relay"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--relay-radius-sm)] px-1.5 py-0.5 text-[10px] font-medium",
        isAssistant
          ? "bg-[var(--relay-accent-blue-soft)] text-[var(--relay-accent-blue)]"
          : "bg-[var(--relay-soft)] text-[var(--relay-muted)]",
      )}
      title={`Captured via ${label}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  )
}

export interface MemoryItemCardProps {
  item: MemoryItemDto
  /** Override the type-derived accent stripe. Leave undefined to use TYPE_ACCENT. */
  accentClass?: string
  /** Show the type label inline; off when the surrounding list is already
   * scoped to a single type. */
  showTypeLabel?: boolean
  onEdit?: (item: MemoryItemDto) => void
  onDelete?: (item: MemoryItemDto) => void
  /** Optional lifecycle pill (cooling / archived). Renders next to the type. */
  lifecycleState?: "active" | "cooling" | "archived" | "forgotten" | null
  busy?: boolean
}

const LIFECYCLE_PILL: Record<
  "cooling" | "archived" | "forgotten",
  { label: string; classes: string }
> = {
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

const COLLAPSED_MAX_HEIGHT = "max-h-24"

export function MemoryItemCard({
  item,
  accentClass,
  showTypeLabel = true,
  onEdit,
  onDelete,
  lifecycleState,
  busy,
}: MemoryItemCardProps) {
  const [expanded, setExpanded] = useState(false)
  // Personal-memory items carry a Folk category in metadata.personalCategory
  // (the item type stays 'note'). When present it drives the accent + label.
  const personalCategory = personalCategoryFromMetadata(item.metadata)
  const personalMeta = personalCategory ? PERSONAL_CATEGORY_META[personalCategory] : null
  const accent = accentClass ?? TYPE_ACCENT[item.type] ?? "bg-zinc-400"
  const created = item.capturedAt ?? item.updatedAt
  const wasEdited =
    Boolean(item.capturedAt) &&
    new Date(item.updatedAt).getTime() - new Date(item.capturedAt!).getTime() >
      60_000
  const pill =
    lifecycleState && lifecycleState !== "active" ? LIFECYCLE_PILL[lifecycleState] : null

  return (
    <article
      className={cn(
        "group relative flex gap-3 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-3 transition-colors hover:bg-[var(--relay-soft)]/50",
        busy && "opacity-50",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-2 left-0 w-1 rounded-r-sm", personalMeta ? null : accent)}
        style={personalMeta ? { backgroundColor: personalMeta.color } : undefined}
      />
      <div className="ml-2 flex-1 min-w-0">
        <header className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--relay-faint)]">
          {personalMeta ? (
            <span className="inline-flex items-center gap-1.5 text-[var(--relay-muted)]">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: personalMeta.color }}
              />
              {personalMeta.label}
            </span>
          ) : (
            showTypeLabel && (
              <span className="capitalize text-[var(--relay-muted)]">{item.type}</span>
            )
          )}
          {pill && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                pill.classes,
              )}
            >
              {pill.label}
            </span>
          )}
          {item.pinned && (
            <span title="Pinned" aria-label="Pinned" className="text-[var(--relay-accent-blue)]">
              <Pin className="size-3" />
            </span>
          )}
          <OriginBadge surface={item.sourceSurface} />
          <span>·</span>
          <span>
            created{" "}
            <time dateTime={created} className="tabular-nums">
              {formatRelativeTime(created)}
            </time>
          </span>
          {wasEdited && (
            <>
              <span>·</span>
              <span>
                edited{" "}
                <time dateTime={item.updatedAt} className="tabular-nums">
                  {formatRelativeTime(item.updatedAt)}
                </time>
              </span>
            </>
          )}
          {item.decayScore < 0.3 && (
            <>
              <span>·</span>
              <span className="text-amber-500">Fading</span>
            </>
          )}
          {item.sourceUrl && (
            <>
              <span>·</span>
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--relay-accent-blue)] hover:underline"
              >
                source
              </a>
            </>
          )}
        </header>
        {item.title && (
          <h3 className="mb-1 text-[13px] font-medium text-[var(--relay-ink)]">
            {item.title}
          </h3>
        )}
        <div
          className={cn(
            "overflow-hidden text-[12px] leading-relaxed text-[var(--relay-ink-secondary)]",
            !expanded && COLLAPSED_MAX_HEIGHT,
          )}
        >
          <Markdown content={item.content} />
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-label={expanded ? "Collapse item" : "Expand item"}
            title={expanded ? "Collapse" : "Expand"}
            className="rounded p-1 text-[var(--relay-faint)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              disabled={busy}
              aria-label="Edit item"
              title="Edit"
              className="rounded p-1 text-[var(--relay-faint)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] disabled:cursor-not-allowed"
            >
              <Pencil className="size-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              disabled={busy}
              aria-label="Delete item"
              title="Delete"
              className="rounded p-1 text-[var(--relay-faint)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-danger)] disabled:cursor-not-allowed"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export interface MemoryItemListProps {
  items: MemoryItemDto[]
  /** Show a fixed-height scrollable container instead of expanding the page. */
  maxHeight?: string
  emptyLabel?: string
  showTypeLabel?: boolean
  accentClass?: string
  onEdit?: (item: MemoryItemDto) => void
  onDelete?: (item: MemoryItemDto) => void
  busyIds?: ReadonlySet<string>
  lifecycleByItemId?: Record<string, "active" | "cooling" | "archived" | "forgotten" | null>
}

const DEFAULT_LIST_MAX_HEIGHT = "max-h-[420px]"

export function MemoryItemList({
  items,
  maxHeight = DEFAULT_LIST_MAX_HEIGHT,
  emptyLabel = "items",
  showTypeLabel,
  accentClass,
  onEdit,
  onDelete,
  busyIds,
  lifecycleByItemId,
}: MemoryItemListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-6 text-center text-[12px] text-[var(--relay-muted)]">
        No {emptyLabel} yet.
      </div>
    )
  }
  return (
    <div className={cn("overflow-y-auto pr-1 space-y-3", maxHeight)}>
      {items.map((item) => (
        <MemoryItemCard
          key={item.id}
          item={item}
          accentClass={accentClass}
          showTypeLabel={showTypeLabel}
          onEdit={onEdit}
          onDelete={onDelete}
          busy={busyIds?.has(item.id)}
          lifecycleState={lifecycleByItemId?.[item.id]}
        />
      ))}
    </div>
  )
}
