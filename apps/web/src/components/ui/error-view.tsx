"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Shared error surface. Minimal, flat, consistent with the design system —
 * structure from a hairline border, not shadow. Used by every route error
 * boundary so failures look intentional, not broken.
 *
 * Auto-retry-then-reveal: when an `onRetry` is provided we silently retry
 * once after a tiny delay and refuse to paint anything for the first 600ms.
 * If the retry resolves the error, the boundary unmounts before reveal time
 * and the user never sees the flash — the right behaviour for transient RSC
 * fetch races. If the retry also fails, the full surface paints with a
 * manual Try Again button.
 */
export function ErrorView({
  kicker = "Relay",
  title = "This page didn't load",
  description = "A request failed on the way in. Try again — if it keeps failing, reload the page.",
  onRetry,
  fullScreen = false,
}: {
  kicker?: string
  title?: string
  description?: string
  onRetry?: () => void
  fullScreen?: boolean
}) {
  const autoRetriedRef = useRef(false)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!onRetry || autoRetriedRef.current) return
    autoRetriedRef.current = true
    const id = window.setTimeout(() => onRetry(), 200)
    return () => window.clearTimeout(id)
  }, [onRetry])

  useEffect(() => {
    if (!onRetry) {
      setRevealed(true)
      return
    }
    const id = window.setTimeout(() => setRevealed(true), 600)
    return () => window.clearTimeout(id)
  }, [onRetry])

  if (!revealed) return null

  return (
    <div
      className={
        fullScreen
          ? "flex min-h-screen items-center justify-center bg-[var(--relay-bg)] px-6 text-[var(--relay-ink)]"
          : "flex flex-1 items-center justify-center px-6 py-24 text-[var(--relay-ink)]"
      }
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6">
        <div className="absolute right-5 top-5 grid size-10 place-items-center rounded-full bg-[var(--relay-soft)] text-[var(--relay-muted)]">
          <span className="size-2 rounded-full bg-[var(--relay-danger)]" />
        </div>
        <div className="mb-6 h-px w-12 bg-[var(--relay-ink)]" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--relay-faint)]">
          {kicker}
        </p>
        <h1 className="mt-3 max-w-[18rem] text-[24px] font-semibold leading-tight text-[var(--relay-ink)]">
          {title}
        </h1>
        <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-[var(--relay-muted)]">
          {description}
        </p>
        <div className="mt-7 flex items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-10 items-center justify-center rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 text-[13px] font-semibold text-[var(--relay-bg)] transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-[var(--relay-radius-sm)] border border-[var(--relay-line-strong)] px-4 text-[13px] font-medium text-[var(--relay-ink)] transition-colors hover:bg-[var(--relay-soft)]"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
