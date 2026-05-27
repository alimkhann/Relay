"use client"

import { type ClipboardEvent, type DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowUp,
  BookmarkCheck,
  BookmarkPlus,
  FileText,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Square,
  X
} from "lucide-react"

import type { AssistantSurface } from "@relay/shared"

import { cn } from "@/lib/cn"
import { useVoiceInput } from "@/hooks/use-voice-input"

import { AskRelayHistory } from "./ask-relay-history"
import { ChatMessage } from "./chat-message"
import { ThinkingIndicator } from "./thinking-indicator"
import { toolLabel } from "./tool-icons"
import { useAssistantChat } from "./use-assistant-chat"
import { VoiceRing } from "./voice-ring"

/**
 * Animated mic waveform — 9 ink-colored bars with staggered breathing. Used in
 * the voice composer overlay. Accent stays neutral (no green) so it matches the
 * rest of the assistant UI.
 */
function Waveform({ still = false, levels }: { still?: boolean; levels?: number[] }) {
  const bars = levels && levels.length > 0 ? levels : new Array(9).fill(0.22)
  return (
    <span
      aria-hidden
      className="inline-flex h-4 items-center gap-[2px] text-[var(--relay-ink)]"
    >
      {bars.map((level, i) => (
        <span
          key={i}
          className="block w-[2px] rounded-[1px] bg-current transition-[height] duration-75 ease-out"
          style={{
            height: still ? "22%" : `${Math.max(12, Math.min(100, level * 100))}%`
          }}
        />
      ))}
    </span>
  )
}

/**
 * The entire Ask Relay chat surface (history, messages, composer, attachments).
 * Rendered inside the right-side Dialog (variant "panel") and as the full-page
 * /chat route (variant "page"). The Dialog/page wrappers only own sizing.
 */
export function ChatView({
  surface,
  projectId,
  plan,
  variant = "panel",
  onClose,
  expanded = false,
  onToggleExpand,
  initialChatId,
  onChatListChanged
}: {
  surface: AssistantSurface
  projectId: string | null
  plan: "free" | "starter" | "pro"
  variant?: "panel" | "page"
  onClose?: () => void
  expanded?: boolean
  onToggleExpand?: () => void
  initialChatId?: string | null
  onChatListChanged?: () => void
}) {
  const router = useRouter()
  const lastRefreshRef = useRef(0)
  const trailingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const {
    messages,
    streaming,
    activeTool,
    error,
    send,
    stop,
    editMessage,
    continueTurn,
    confirmAction,
    selectBranch,
    setFeedback,
    undo,
    attachments,
    hasUploadingAttachments,
    addFiles,
    removeAttachment,
    saveAttachmentToSources,
    canSaveToSources,
    loadChat,
    chatId,
    copyMessage,
    reset
  } = useAssistantChat(surface, projectId, {
    onMutation: (result) => {
      // Let any same-tab client widget (memory list, brief) react instantly.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("relay:memory-mutated", { detail: result }))
      }
      // Re-fetch server components for this surface. Leading-edge (first
      // change reflects immediately) + a trailing refresh so the last of a
      // burst is never dropped.
      const now = Date.now()
      if (now - lastRefreshRef.current >= 1500) {
        lastRefreshRef.current = now
        router.refresh()
      } else if (!trailingRefreshRef.current) {
        trailingRefreshRef.current = setTimeout(() => {
          trailingRefreshRef.current = null
          lastRefreshRef.current = Date.now()
          router.refresh()
        }, 1500)
      }
    },
    onChatChanged: () => {
      onChatListChanged?.()
      setHistoryRefreshKey((key) => key + 1)
    }
  })
  const [draft, setDraft] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [previewAttachment, setPreviewAttachment] = useState<{ id: string; fileName: string } | null>(null)
  const [voiceDeniedDismissed, setVoiceDeniedDismissed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const voice = useVoiceInput((text) => setDraft((d) => (d ? `${d} ${text}` : text)))

  useEffect(() => {
    if (voice.status !== "denied") setVoiceDeniedDismissed(false)
  }, [voice.status])

  const isVoiceActive = voice.listening || voice.status === "requesting"

  useEffect(
    () => () => {
      if (trailingRefreshRef.current) clearTimeout(trailingRefreshRef.current)
    },
    []
  )

  useEffect(() => {
    // Load a deep-linked chat (e.g. /chat?chatId=…). loadChat is stable.
    if (initialChatId) void loadChat(initialChatId)
  }, [initialChatId, loadChat])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, streaming, activeTool])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const maxHeight = 20 * 3 + 8
    el.style.height = "auto"
    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [draft])

  const capturePageContext = () => {
    if (typeof window === "undefined") return undefined
    const selection = window.getSelection?.()?.toString().trim().slice(0, 20000) || undefined
    return { url: window.location.href, title: `${document.title} · ${surface}`, selection }
  }

  const submit = () => {
    if (!draft.trim() || streaming || hasUploadingAttachments) return
    send(draft, capturePageContext(), { webSearch })
    setDraft("")
    setWebSearch(false)
    setComposerMenuOpen(false)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) void addFiles(files)
  }

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files)
    if (files.length > 0) {
      e.preventDefault()
      void addFiles(files)
    }
  }

  const empty = messages.length === 0
  // Constrain the message rail + composer when the panel is wider than ~500px
  // (page variant or expanded panel) so users don't have to look ear to ear.
  const constrain = variant === "page" || expanded
  const messagesWidth = constrain ? "mx-auto w-full max-w-3xl" : ""
  const voiceStatusText =
    voice.status === "requesting"
      ? "Requesting microphone…"
      : voice.status === "listening"
        ? "Listening…"
        : voice.status === "denied"
          ? voice.error ?? "Microphone permission is blocked."
          : voice.status === "error"
            ? voice.error ?? "Voice input failed."
            : voice.status === "unsupported"
              ? "Voice input is not available in this browser."
              : null

  return (
    <div
      data-relay-surface="assistant"
      className="relative flex h-full min-h-0 flex-col bg-[var(--relay-bg)]"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 m-2 grid place-items-center rounded-[var(--relay-radius-lg)] border-2 border-dashed border-[var(--relay-accent-blue)] bg-[var(--relay-accent-blue-soft)] text-sm font-semibold text-[var(--relay-accent-blue)]">
          Drop files to attach
        </div>
      ) : null}

      <AskRelayHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentChatId={chatId}
        refreshKey={historyRefreshKey}
        onSelect={(id) => {
          void loadChat(id)
          setHistoryOpen(false)
        }}
      />
      {previewAttachment ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setPreviewAttachment(null)}
        >
          <div className="max-h-[86vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewAttachment(null)}
              className="mb-2 ml-auto grid size-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close preview"
            >
              <X className="size-4" />
            </button>
            <img
              src={
                attachments.find((a) => a.id === previewAttachment.id)?.previewUrl ??
                `/api/assistant/attachments/${previewAttachment.id}/content`
              }
              alt={previewAttachment.fileName}
              className="max-h-[80vh] rounded-[var(--relay-radius-lg)] object-contain"
            />
          </div>
        </div>
      ) : null}

      <header className="flex items-center justify-between border-b border-[var(--relay-line)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--relay-ink)]">
          <Sparkles className="size-4 text-[var(--relay-accent-blue)]" />
          Relay
        </div>
        <div className="flex items-center gap-0.5">
          {/* New + History live in the /chat page's left sidebar already.
              Only render them inside ChatView when it's the floating panel. */}
          {variant !== "page" ? (
            <>
              <button
                type="button"
                onClick={reset}
                className="rounded-[var(--relay-radius-sm)] px-2 py-1 text-xs text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
              >
                New
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="Chat history"
                title="Chat history"
                className="rounded-[var(--relay-radius-sm)] p-1.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
              >
                <History className="size-4" />
              </button>
            </>
          ) : null}
          {onToggleExpand ? (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={expanded ? "Narrow panel" : "Widen panel"}
              title={expanded ? "Narrow panel" : "Widen panel"}
              className="rounded-[var(--relay-radius-sm)] p-1.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-[var(--relay-radius-sm)] p-1.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto px-4 py-4",
          empty ? "flex flex-col items-center justify-center" : "space-y-4"
        )}
      >
        {empty ? (
          <div className="max-w-[300px] text-center text-sm text-[var(--relay-muted)]">
            <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-[var(--relay-accent-blue-soft)]">
              <Sparkles className="size-5 text-[var(--relay-accent-blue)]" />
            </span>
            <p className="text-base font-semibold text-[var(--relay-ink)]">Ask about your work</p>
            <p className="mt-1.5 leading-relaxed">
              &ldquo;What was I working on?&rdquo; · &ldquo;Save this decision&rdquo; ·
              &ldquo;Summarize my project&rdquo;
            </p>
          </div>
        ) : null}

        <div className={cn(messagesWidth, !empty && "space-y-4")}>
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              onConfirm={confirmAction}
              onUndo={undo}
              onCopy={copyMessage}
              onFeedback={setFeedback}
              onEdit={editMessage}
              onSelectBranch={selectBranch}
              onSaveAttachment={saveAttachmentToSources}
              canSaveAttachments={canSaveToSources}
              onContinue={continueTurn}
            />
          ))}

          <AnimatePresence>
            {activeTool ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ThinkingIndicator label={`${toolLabel(activeTool)}…`} tool={activeTool} />
              </motion.div>
            ) : streaming ? (
              <ThinkingIndicator />
            ) : null}
          </AnimatePresence>

          {error ? (
            <div className="rounded-[var(--relay-radius-lg)] border border-[var(--relay-danger)]/30 bg-[var(--relay-danger-soft)] p-3 text-sm text-[var(--relay-ink)]">
              <p>{error.message}</p>
              {error.upgradeUrl ? (
                <a
                  href={error.upgradeUrl}
                  className="mt-2 inline-block rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent-blue)] px-3 py-1.5 text-xs font-semibold text-[var(--relay-accent-blue-ink)] hover:bg-[var(--relay-accent-blue-hover)]"
                >
                  Upgrade to keep going
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {plan === "free" ? (
        <div className="border-t border-[var(--relay-line)] bg-[var(--relay-soft)]/50 px-4 py-2 text-center text-xs text-[var(--relay-muted)]">
          Free preview — upgrade for unlimited Relay
        </div>
      ) : null}

      <div className="p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) void addFiles(files)
            e.target.value = ""
          }}
        />
        {voice.status === "denied" && !voiceDeniedDismissed ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="alert"
            className={cn(
              "mb-2 flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--relay-danger)_28%,transparent)] bg-[var(--relay-danger-soft)] px-3 py-2 text-xs text-[var(--relay-danger)]",
              constrain && "mx-auto w-full max-w-3xl"
            )}
          >
            <MicOff className="size-3.5" />
            <span className="flex-1 truncate">Microphone access denied</span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.open(
                    "chrome://settings/content/microphone",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              }}
              className="underline underline-offset-2 hover:opacity-80"
            >
              Allow
            </button>
            <button
              type="button"
              aria-label="Dismiss microphone notice"
              onClick={() => setVoiceDeniedDismissed(true)}
              className="grid size-5 place-items-center rounded-full hover:bg-[color:color-mix(in_srgb,var(--relay-danger)_18%,transparent)]"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        ) : null}

        {isVoiceActive ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            className={cn(
              "relative flex items-center gap-2 rounded-full bg-[var(--relay-soft)] px-2 py-1.5 ring-1 ring-[var(--relay-line)]",
              constrain && "mx-auto w-full max-w-3xl"
            )}
          >
            <VoiceRing active={isVoiceActive} volumeRef={voice.volumeRef} />
            <button
              type="button"
              aria-label="Cancel voice input"
              onClick={() => voice.stop()}
              className="relative grid size-7 place-items-center rounded-full border border-[var(--relay-line)] text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft-hover)] hover:text-[var(--relay-ink)] active:scale-95"
            >
              <X className="size-3.5" />
            </button>
            <div className="relative flex min-w-0 flex-1 items-center gap-2.5 px-1">
              <Waveform still={voice.status === "requesting"} levels={voice.levels} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  draft ? "text-[var(--relay-ink-secondary)]" : "text-[var(--relay-muted)]"
                )}
              >
                {voice.status === "requesting"
                  ? "Requesting microphone…"
                  : draft || "Listening…"}
              </span>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || hasUploadingAttachments}
              aria-label="Send"
              className="relative grid size-7 place-items-center rounded-full bg-[var(--relay-accent-blue)] text-[var(--relay-accent-blue-ink)] transition-transform hover:bg-[var(--relay-accent-blue-hover)] active:scale-95 disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </motion.div>
        ) : (
        <div
          className={cn(
            "rounded-3xl bg-[var(--relay-soft)] px-3 py-2 ring-1 ring-transparent transition-[box-shadow,border-color,background] duration-150",
            "focus-within:ring-2 focus-within:ring-[var(--relay-line-strong)] focus-within:bg-[var(--relay-soft-hover)]",
            constrain && "mx-auto w-full max-w-3xl"
          )}
        >
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-[var(--relay-radius)] bg-[var(--relay-surface)] py-1 pl-2 pr-1 text-xs text-[var(--relay-ink)] ring-1 ring-[var(--relay-line)]"
                >
                  {a.uploading ? (
                    <Loader2 className="size-3.5 animate-spin text-[var(--relay-muted)]" />
                  ) : a.mime.startsWith("image/") ? (
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment({ id: a.id, fileName: a.fileName })}
                      className="h-8 w-8 overflow-hidden rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]"
                      aria-label={`Preview ${a.fileName}`}
                    >
                      <img
                        src={a.previewUrl ?? `/api/assistant/attachments/${a.id}/content`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <FileText className="size-3.5 text-[var(--relay-accent-blue)]" />
                  )}
                  <span className="max-w-[140px] truncate">{a.fileName}</span>
                  {canSaveToSources && !a.uploading && !a.mime.startsWith("image/") ? (
                    <button
                      type="button"
                      onClick={() => !a.savedToRelay && saveAttachmentToSources(a.id)}
                      aria-label={a.savedToRelay ? "Saved to Sources" : "Save to Sources"}
                      title={a.savedToRelay ? "Saved to Sources" : "Save to Sources"}
                      disabled={a.savedToRelay || a.saving}
                      className="rounded-[var(--relay-radius-sm)] p-0.5 text-[var(--relay-muted)] hover:text-[var(--relay-accent-blue)] disabled:opacity-100"
                    >
                      {a.saving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : a.savedToRelay ? (
                        <BookmarkCheck className="size-3.5 text-[var(--relay-accent-blue)]" />
                      ) : (
                        <BookmarkPlus className="size-3.5" />
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    aria-label={`Remove ${a.fileName}`}
                    className="rounded-[var(--relay-radius-sm)] p-0.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft-hover)] hover:text-[var(--relay-ink)]"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {webSearch ? (
            <div className="mb-2 flex">
              <button
                type="button"
                onClick={() => setWebSearch(false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--relay-accent-blue-soft)] px-2 py-1 text-xs font-medium text-[var(--relay-accent-blue)]"
                aria-label="Disable web search"
                title="Disable web search"
              >
                <Search className="size-3.5" />
                Search
                <X className="size-3" />
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setComposerMenuOpen((open) => !open)}
                aria-label="Add context"
                title="Add context"
                className={cn(
                  "grid size-7 place-items-center rounded-full text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft-hover)] hover:text-[var(--relay-ink)]",
                  composerMenuOpen && "bg-[var(--relay-soft-hover)] text-[var(--relay-ink)]"
                )}
              >
                <Plus className="size-4" />
              </button>
              {composerMenuOpen ? (
                <div className="absolute bottom-full left-0 z-20 mb-2 min-w-52 rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-bg)] p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click()
                      setComposerMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-2 text-left text-sm text-[var(--relay-ink)] hover:bg-[var(--relay-soft)]"
                  >
                    <Paperclip className="size-4 text-[var(--relay-muted)]" />
                    Upload files or images
                  </button>
                  <button
                    type="button"
                    onClick={() => setWebSearch((value) => !value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-[var(--relay-radius-sm)] px-2.5 py-2 text-left text-sm hover:bg-[var(--relay-soft)]",
                      webSearch ? "text-[var(--relay-accent-blue)]" : "text-[var(--relay-ink)]"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Search className="size-4 text-current" />
                      Web search
                    </span>
                    <span
                      className={cn(
                        "h-4 w-7 rounded-full p-0.5 transition-colors",
                        webSearch ? "bg-[var(--relay-accent-blue)]" : "bg-[var(--relay-line-strong)]"
                      )}
                      aria-hidden
                    >
                      <span
                        className={cn(
                          "block size-3 rounded-full bg-[var(--relay-bg)] transition-transform",
                          webSearch && "translate-x-3"
                        )}
                      />
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder="Ask anything…"
              className="max-h-32 min-h-7 flex-1 resize-none border-0 bg-transparent py-1 text-sm leading-5 text-[var(--relay-ink)] outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-[var(--relay-muted)]"
            />
            <button
              type="button"
              onClick={() => void voice.start()}
              disabled={!voice.supported}
              aria-label="Voice input"
              title={voiceStatusText ?? "Voice input"}
              className={cn(
                "relative grid size-7 place-items-center rounded-full transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
                voice.status === "denied" || voice.status === "error"
                  ? "text-[var(--relay-danger)] hover:bg-[var(--relay-danger-soft)]"
                  : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft-hover)] hover:text-[var(--relay-ink)]"
              )}
            >
              <Mic className="size-4" />
            </button>
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                className="grid size-7 place-items-center rounded-full bg-[var(--relay-accent-blue)] text-[var(--relay-accent-blue-ink)] transition-colors hover:bg-[var(--relay-accent-blue-hover)]"
              >
                <Square className="size-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || hasUploadingAttachments}
                aria-label="Send"
                className="grid size-7 place-items-center rounded-full bg-[var(--relay-accent-blue)] text-[var(--relay-accent-blue-ink)] transition-opacity hover:bg-[var(--relay-accent-blue-hover)] disabled:opacity-40"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
        )}
        {voice.status === "error" && voiceStatusText ? (
          <div className={cn("mt-2 text-xs text-[var(--relay-danger)]", constrain && "mx-auto w-full max-w-3xl")}>
            {voiceStatusText}
          </div>
        ) : null}
      </div>
    </div>
  )
}
