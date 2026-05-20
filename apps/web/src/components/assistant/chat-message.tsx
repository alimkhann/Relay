"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { Check, ChevronLeft, ChevronRight, Copy, Pencil, ThumbsDown, ThumbsUp } from "lucide-react"

import type {
  AssistantActionResult,
  AssistantMessageFeedback,
  AssistantPendingAction
} from "@relay/shared"

import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/cn"

import { ActionResultCard } from "./action-result-card"
import type { UiMessage } from "./use-assistant-chat"

function IconButton({
  label,
  onClick,
  active,
  children
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded-[var(--relay-radius-sm)] p-1 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
        active && "text-[var(--relay-ink)]"
      )}
    >
      {children}
    </button>
  )
}

export function ChatMessage({
  message,
  onConfirm,
  onUndo,
  onCopy,
  onFeedback,
  onEdit,
  onSelectBranch
}: {
  message: UiMessage
  onConfirm: (action: AssistantPendingAction) => void
  onUndo: (result: AssistantActionResult) => void
  onCopy: (text: string) => void
  onFeedback: (id: string, value: AssistantMessageFeedback) => void
  onEdit: (message: UiMessage, text: string) => void
  onSelectBranch: (parentId: string | null, siblingId: string) => void
}) {
  const isUser = message.role === "user"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [copied, setCopied] = useState(false)

  const copy = () => {
    onCopy(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const branch = message.branch
  const cycle = (dir: -1 | 1) => {
    if (!branch) return
    const next = branch.index - 1 + dir
    const target = branch.siblingIds[next]
    if (next < 0 || next >= branch.total || !target) return
    onSelectBranch(message.parentId, target)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn("group flex w-full", isUser ? "justify-end" : "justify-start")}
      data-testid="chat-message"
      data-role={message.role}
    >
      <div
        className={cn(
          "flex flex-col gap-1.5",
          isUser ? "max-w-[85%] items-end" : "w-full"
        )}
      >
        {editing ? (
          <div className="w-full min-w-[260px] rounded-[var(--relay-radius-lg)] bg-[var(--relay-soft)] p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full resize-none border-0 bg-transparent text-sm text-[var(--relay-ink)] outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft(message.content)
                }}
                className="rounded-[var(--relay-radius-sm)] px-2.5 py-1 text-xs text-[var(--relay-muted)] hover:bg-[var(--relay-soft-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (draft.trim()) {
                    onEdit(message, draft)
                    setEditing(false)
                  }
                }}
                className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent-blue)] px-2.5 py-1 text-xs font-semibold text-[var(--relay-accent-blue-ink)] hover:bg-[var(--relay-accent-blue-hover)]"
              >
                Save &amp; submit
              </button>
            </div>
          </div>
        ) : message.content ? (
          isUser ? (
            <div className="rounded-[var(--relay-radius-lg)] bg-[var(--relay-accent-blue)] px-3.5 py-2.5 text-sm text-[var(--relay-accent-blue-ink)]">
              <span className="whitespace-pre-wrap">{message.content}</span>
            </div>
          ) : (
            <div className="w-full text-sm text-[var(--relay-ink)]">
              <Markdown content={message.content} className="text-sm" />
            </div>
          )
        ) : null}

        {message.actionResults.map((result, i) => (
          <ActionResultCard key={i} result={result} onUndo={onUndo} />
        ))}

        {message.pending ? (
          <div className="rounded-[var(--relay-radius-lg)] border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="text-[var(--relay-ink)]">
              Confirm to <span className="font-semibold">{message.pending.summary}</span>?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => message.pending && onConfirm(message.pending)}
                className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent-blue)] px-3 py-1.5 text-xs font-semibold text-[var(--relay-accent-blue-ink)] hover:bg-[var(--relay-accent-blue-hover)]"
              >
                Confirm
              </button>
              <span className="self-center text-xs text-[var(--relay-muted)]">
                This changes saved data.
              </span>
            </div>
          </div>
        ) : null}

        {!editing && !message.streaming ? (
          <div
            className={cn(
              "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
              isUser ? "flex-row-reverse" : "flex-row"
            )}
          >
            {branch ? (
              <div className="flex items-center gap-0.5 text-xs text-[var(--relay-muted)]">
                <IconButton label="Previous version" onClick={() => cycle(-1)}>
                  <ChevronLeft className="size-3.5" />
                </IconButton>
                <span className="tabular-nums">
                  {branch.index}/{branch.total}
                </span>
                <IconButton label="Next version" onClick={() => cycle(1)}>
                  <ChevronRight className="size-3.5" />
                </IconButton>
              </div>
            ) : null}
            {message.content ? (
              <IconButton label={copied ? "Copied" : "Copy"} onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </IconButton>
            ) : null}
            {isUser ? (
              <IconButton
                label="Edit"
                onClick={() => {
                  setDraft(message.content)
                  setEditing(true)
                }}
              >
                <Pencil className="size-3.5" />
              </IconButton>
            ) : (
              <>
                <IconButton
                  label="Good response"
                  active={message.feedback === "like"}
                  onClick={() => onFeedback(message.id, "like")}
                >
                  <ThumbsUp className="size-3.5" />
                </IconButton>
                <IconButton
                  label="Bad response"
                  active={message.feedback === "dislike"}
                  onClick={() => onFeedback(message.id, "dislike")}
                >
                  <ThumbsDown className="size-3.5" />
                </IconButton>
              </>
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
