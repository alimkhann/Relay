"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, Mic, Sparkles, Square, X } from "lucide-react"

import type { AssistantSurface } from "@relay/shared"

import { cn } from "@/lib/cn"
import { useVoiceInput } from "@/hooks/use-voice-input"

import { ChatMessage } from "./chat-message"
import { ThinkingIndicator } from "./thinking-indicator"
import { toolLabel } from "./tool-icons"
import { useAssistantChat } from "./use-assistant-chat"

export function AskRelayPanel({
  open,
  onOpenChange,
  surface,
  projectId,
  plan
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  surface: AssistantSurface
  projectId: string | null
  plan: "free" | "starter" | "pro"
}) {
  const {
    messages,
    streaming,
    activeTool,
    error,
    send,
    stop,
    editMessage,
    confirmAction,
    selectBranch,
    setFeedback,
    undo,
    copyMessage,
    reset
  } = useAssistantChat(surface, projectId)
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const voice = useVoiceInput((text) => setDraft((d) => (d ? `${d} ${text}` : text)))

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, streaming, activeTool])

  const submit = () => {
    if (!draft.trim() || streaming) return
    send(draft)
    setDraft("")
  }

  const empty = messages.length === 0

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-0 right-0 z-50 flex h-full w-full max-w-[440px] flex-col border-l border-[var(--relay-line)] bg-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Relay</DialogPrimitive.Title>

          <header className="flex items-center justify-between border-b border-[var(--relay-line)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--relay-ink)]">
              <Sparkles className="size-4 text-[var(--relay-accent-blue)]" />
              Relay
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                className="rounded-[var(--relay-radius-sm)] px-2 py-1 text-xs text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
              >
                New
              </button>
              <DialogPrimitive.Close className="rounded-[var(--relay-radius-sm)] p-1.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]">
                <X className="size-4" />
              </DialogPrimitive.Close>
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
                <p className="text-base font-semibold text-[var(--relay-ink)]">
                  Ask about your work
                </p>
                <p className="mt-1.5 leading-relaxed">
                  &ldquo;What was I working on?&rdquo; · &ldquo;Save this decision&rdquo; ·
                  &ldquo;Summarize my project&rdquo;
                </p>
              </div>
            ) : null}

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

          {plan === "free" ? (
            <div className="border-t border-[var(--relay-line)] bg-[var(--relay-soft)]/50 px-4 py-2 text-center text-xs text-[var(--relay-muted)]">
              Free preview — upgrade for unlimited Relay
            </div>
          ) : null}

          <div className="p-3">
            <div className="flex items-end gap-2 rounded-[var(--relay-radius-lg)] bg-[var(--relay-soft)] px-3 py-2 ring-1 ring-transparent transition-shadow focus-within:ring-[var(--relay-accent-blue)]/50">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                rows={1}
                placeholder="Ask anything…"
                className="max-h-32 flex-1 resize-none border-0 bg-transparent text-sm text-[var(--relay-ink)] outline-none focus:ring-0 placeholder:text-[var(--relay-muted)]"
              />
              {voice.supported ? (
                <button
                  type="button"
                  onClick={() => (voice.listening ? voice.stop() : voice.start())}
                  aria-label="Voice input"
                  className={cn(
                    "rounded-full p-1.5 transition-colors",
                    voice.listening
                      ? "bg-[var(--relay-accent-blue)] text-[var(--relay-accent-blue-ink)]"
                      : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft-hover)] hover:text-[var(--relay-ink)]"
                  )}
                >
                  <Mic className="size-4" />
                </button>
              ) : null}
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop"
                  className="rounded-full bg-[var(--relay-accent-blue)] p-1.5 text-[var(--relay-accent-blue-ink)] transition-colors hover:bg-[var(--relay-accent-blue-hover)]"
                >
                  <Square className="size-4 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!draft.trim()}
                  aria-label="Send"
                  className="rounded-full bg-[var(--relay-accent-blue)] p-1.5 text-[var(--relay-accent-blue-ink)] transition-opacity hover:bg-[var(--relay-accent-blue-hover)] disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
