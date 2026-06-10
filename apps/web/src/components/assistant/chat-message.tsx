"use client"

import { useState } from "react"
import { motion } from "motion/react"
import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  X
} from "lucide-react"

import type {
  AssistantActionResult,
  AssistantAttachmentDto,
  AssistantMessageFeedback,
  AssistantPendingAction
} from "@relay/shared"

import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/cn"

import { filterRenderablePendingActions, shouldRenderPendingAction } from "@relay/shared/utils/assistant-chat-path"

import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought"
import { ActionResultCard, MemoryActionPreview } from "./action-result-card"
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

function AttachmentChips({
  attachments,
  canSave,
  onSave
}: {
  attachments: AssistantAttachmentDto[]
  canSave: boolean
  onSave: (id: string) => Promise<void>
}) {
  const [preview, setPreview] = useState<AssistantAttachmentDto | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  if (attachments.length === 0) return null

  return (
    <>
      <div className="flex max-w-full flex-wrap justify-end gap-1.5">
        {attachments.map((a) => {
          const isImage = a.mime.startsWith("image/")
          return (
            <span
              key={a.id}
              className="flex max-w-[220px] items-center gap-1.5 rounded-[var(--relay-radius)] bg-[var(--relay-surface)] py-1 pl-1.5 pr-1 text-xs text-[var(--relay-ink)] ring-1 ring-[var(--relay-line)]"
            >
              {isImage ? (
                <button
                  type="button"
                  onClick={() => setPreview(a)}
                  className="h-8 w-8 overflow-hidden rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]"
                  aria-label={`Preview ${a.fileName}`}
                >
                  <img
                    src={a.previewUrl ?? `/api/assistant/attachments/${a.id}/content`}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ) : (
                <span className="grid size-6 place-items-center rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]">
                  <FileText className="size-3.5 text-[var(--relay-muted)]" />
                </span>
              )}
              <span className="truncate">{a.fileName}</span>
              {canSave && !isImage ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (a.savedToRelay || savingId) return
                    setSavingId(a.id)
                    await onSave(a.id)
                    setSavingId(null)
                  }}
                  disabled={a.savedToRelay || savingId === a.id}
                  className="rounded-[var(--relay-radius-sm)] p-0.5 text-[var(--relay-muted)] hover:text-[var(--relay-accent-blue)] disabled:opacity-100"
                  title={a.savedToRelay ? "Saved to Sources" : "Save to Sources"}
                  aria-label={a.savedToRelay ? "Saved to Sources" : "Save to Sources"}
                >
                  {savingId === a.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : a.savedToRelay ? (
                    <BookmarkCheck className="size-3.5 text-[var(--relay-accent-blue)]" />
                  ) : (
                    <BookmarkPlus className="size-3.5" />
                  )}
                </button>
              ) : null}
            </span>
          )
        })}
      </div>
      {preview ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="max-h-[86vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="mb-2 ml-auto grid size-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close preview"
            >
              <X className="size-4" />
            </button>
            <img
              src={preview.previewUrl ?? `/api/assistant/attachments/${preview.id}/content`}
              alt={preview.fileName}
              className="max-h-[80vh] rounded-[var(--relay-radius-lg)] object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

export function ChatMessage({
  message,
  onConfirm,
  onDecline,
  onConfirmAll,
  onDeclineAll,
  onUndo,
  onCopy,
  onFeedback,
  onEdit,
  onSelectBranch,
  onSaveAttachment,
  canSaveAttachments,
  onContinue
}: {
  message: UiMessage
  onConfirm: (action: AssistantPendingAction) => void
  onDecline: (action: AssistantPendingAction) => void
  onConfirmAll?: (message: UiMessage) => void
  onDeclineAll?: (message: UiMessage) => void
  onUndo: (result: AssistantActionResult) => void
  onCopy: (text: string) => void
  onFeedback: (id: string, value: AssistantMessageFeedback) => void
  onEdit: (message: UiMessage, text: string) => void
  onSelectBranch: (parentId: string | null, siblingId: string) => void
  onSaveAttachment: (id: string) => Promise<void>
  canSaveAttachments: boolean
  onContinue?: (message: UiMessage) => void
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
            <>
              <AttachmentChips
                attachments={message.attachments}
                canSave={canSaveAttachments}
                onSave={onSaveAttachment}
              />
              <div className="rounded-[var(--relay-radius-lg)] bg-[var(--relay-accent-blue)] px-3.5 py-2.5 text-sm text-[var(--relay-accent-blue-ink)]">
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
            </>
          ) : (
            <div className="w-full text-sm text-[var(--relay-ink)]">
              <Markdown content={message.content} className="text-sm" />
            </div>
          )
        ) : null}

        {message.toolSteps && message.toolSteps.length > 0 && !message.streaming ? (
          <ChainOfThought defaultOpen={false}>
            <ChainOfThoughtHeader>Tool calls ({message.toolSteps.length})</ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              {message.toolSteps.map((step, i) => (
                <ChainOfThoughtStep
                  key={i}
                  label={step.label}
                  status={step.status}
                  description={step.durationMs !== undefined ? `${step.durationMs} ms` : undefined}
                />
              ))}
            </ChainOfThoughtContent>
          </ChainOfThought>
        ) : null}

        {message.actionResults.map((result, i) => (
          <ActionResultCard key={i} result={result} onUndo={onUndo} />
        ))}

        {message.pendingContinuation && onContinue ? (
          <div className="rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-soft)]/60 p-3 text-sm">
            <p className="text-[var(--relay-ink)]">
              Reached the step limit. Continue from where I stopped?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onContinue(message)}
                className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent-blue)] px-3 py-1.5 text-xs font-semibold text-[var(--relay-accent-blue-ink)] hover:bg-[var(--relay-accent-blue-hover)]"
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {(() => {
          const renderable = filterRenderablePendingActions(message.pendingActions ?? [])
          // Also render legacy single-pending if pendingActions is empty
          const legacySingle = renderable.length === 0 && shouldRenderPendingAction(message.pending, message.actionResults)
            ? message.pending
            : null
          const allPending = renderable.length > 0 ? renderable : legacySingle ? [legacySingle] : []
          if (allPending.length === 0) return null
          const awaitingApproval = allPending.filter((a) => !a.status || a.status === "pending")
          return (
            <div className="space-y-2">
              {allPending.map((action) => (
                <div
                  key={action.id}
                  className={cn(
                    "rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-soft)]/60 p-3 text-sm",
                    action.status === "failed" && "border-[var(--relay-danger)]/50 bg-[var(--relay-danger)]/5",
                    action.status === "succeeded" && "border-emerald-500/30 bg-emerald-500/5"
                  )}
                >
                  <p className="text-[var(--relay-ink)]">
                    {action.status === "succeeded"
                      ? "Completed"
                      : action.status === "failed"
                        ? "Failed"
                        : action.status === "running"
                          ? "Running"
                          : "Allow agent to"}{" "}
                    <span className="font-semibold">{action.summary}</span>
                    {!action.status || action.status === "pending" ? "?" : ""}
                  </p>
                  {action.error ? (
                    <p className="mt-1 text-xs text-[var(--relay-danger)]">{action.error}</p>
                  ) : null}
                  {action.previews && action.previews.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {action.previews.slice(0, 3).map((preview, index) => (
                        <MemoryActionPreview key={index} preview={preview} />
                      ))}
                    </div>
                  ) : null}
                  {!action.status || action.status === "pending" ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onConfirm(action)}
                        className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent-blue)] px-3 py-1.5 text-xs font-semibold text-[var(--relay-accent-blue-ink)] hover:bg-[var(--relay-accent-blue-hover)]"
                      >
                        Allow
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecline(action)}
                        className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-1.5 text-xs text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {awaitingApproval.length > 1 && onConfirmAll && onDeclineAll ? (
                <div className="flex gap-2 border-t border-[var(--relay-line)] pt-2">
                  <button
                    type="button"
                    onClick={() => onConfirmAll(message)}
                    className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent-blue)] px-3 py-1.5 text-xs font-semibold text-[var(--relay-accent-blue-ink)] hover:bg-[var(--relay-accent-blue-hover)]"
                  >
                    Allow all ({awaitingApproval.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeclineAll(message)}
                    className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-1.5 text-xs text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
                  >
                    Decline all
                  </button>
                </div>
              ) : null}
            </div>
          )
        })()}

        {!editing && !message.streaming ? (
          <div
            className={cn(
              "flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100",
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
