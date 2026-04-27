"use client"

import { Suspense, useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { relayClientFetch } from "@/lib/telemetry/fetch"
import { createClientFlowId } from "@/lib/telemetry/client"

const REASONS = [
  { id: "too_complex", label: "Too complex to set up" },
  { id: "missing_feature", label: "Missing a feature I need" },
  { id: "switching_tool", label: "Switching to another tool" },
  { id: "just_trying", label: "Just trying it out" },
  { id: "price", label: "Price" },
  { id: "other", label: "Other" },
] as const

type ReasonId = (typeof REASONS)[number]["id"]

function GoodbyeContent() {
  const searchParams = useSearchParams()
  const isDelete = searchParams.get("intent") === "delete"

  const [selected, setSelected] = useState<Set<ReasonId>>(new Set())
  const [note, setNote] = useState("")
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(id: ReasonId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit() {
    startTransition(async () => {
      setError(null)
      const feedback = {
        reasons: Array.from(selected),
        note: note.trim() || null,
      }

      if (isDelete) {
        try {
          const flowId = createClientFlowId("account-delete-goodbye")
          const response = await relayClientFetch("/api/account/delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ feedback }),
            telemetry: {
              surface: "web-settings",
              area: "account",
              event: "account.delete",
              flowId,
              logSuccess: true,
            },
          })

          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string }
            throw new Error(data.error ?? "Could not delete account")
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not delete account. Try again.")
          return
        }
      }

      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--relay-bg)] px-4 text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--relay-soft,rgba(0,0,0,0.06))] border border-[var(--relay-line)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--relay-ink)]">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)] mb-3">Thank you for the feedback</h1>
        <p className="text-sm text-[var(--relay-muted)] mb-8 max-w-xs leading-relaxed">
          {isDelete
            ? "Your account and all data have been permanently deleted."
            : "Your feedback helps us improve Relay."}
        </p>
        <a
          href="https://chromewebstore.google.com/detail/relay/ncdghdilopkelbadnkiblakpjhkdipfj"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-5 py-3 text-sm font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft,rgba(0,0,0,0.04))]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Reinstall Relay
        </a>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--relay-bg)] px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-3xl mb-3">😞</p>
          <h1 className="text-2xl font-bold text-[var(--relay-ink)] mb-2">
            {isDelete ? "Sorry to see you go" : "How are we doing?"}
          </h1>
          <p className="text-sm text-[var(--relay-muted)]">
            {isDelete
              ? "Before you leave, would you mind telling us why? This helps us improve Relay."
              : "Your feedback helps us make Relay better. What can we improve?"}
          </p>
        </div>

        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden mb-4">
          {REASONS.map((reason, idx) => (
            <button
              key={reason.id}
              type="button"
              onClick={() => toggle(reason.id)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm transition",
                idx > 0 ? "border-t border-[var(--relay-line)]" : "",
                selected.has(reason.id)
                  ? "bg-[var(--relay-soft,rgba(0,0,0,0.04))] text-[var(--relay-ink)]"
                  : "text-[var(--relay-ink)] hover:bg-[var(--relay-soft,rgba(0,0,0,0.03))]",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                  selected.has(reason.id)
                    ? "border-[var(--relay-ink)] bg-[var(--relay-ink)]"
                    : "border-[var(--relay-line-strong)]",
                ].join(" ")}
              >
                {selected.has(reason.id) && (
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.5 6L8 1" stroke="var(--relay-bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {reason.label}
            </button>
          ))}
        </div>

        <textarea
          className="w-full rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-3 text-sm text-[var(--relay-ink)] placeholder:text-[var(--relay-muted)] resize-none outline-none focus:border-[var(--relay-line-strong)] transition mb-4"
          rows={3}
          placeholder="Anything else you'd like to share? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && (
          <p className="mb-3 text-sm text-[var(--relay-danger)]">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className={[
            "w-full rounded-[var(--relay-radius-sm)] px-4 py-3 text-sm font-semibold transition disabled:opacity-50 mb-3",
            isDelete
              ? "bg-[var(--relay-danger)] text-white hover:opacity-90"
              : "bg-[var(--relay-ink)] text-[var(--relay-bg)] hover:opacity-90",
          ].join(" ")}
        >
          {pending
            ? isDelete ? "Deleting account…" : "Sending…"
            : isDelete ? "Delete my account" : "Send feedback"}
        </button>

        <a
          href={isDelete ? "/dashboard/settings?section=account" : "/dashboard"}
          className="block w-full text-center text-sm text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition py-2"
        >
          {isDelete ? "Never mind, keep my account →" : "Back to dashboard →"}
        </a>
      </div>
    </div>
  )
}

export default function GoodbyePage() {
  return (
    <Suspense>
      <GoodbyeContent />
    </Suspense>
  )
}
