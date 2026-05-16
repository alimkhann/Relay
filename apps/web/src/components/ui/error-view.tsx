"use client"

/**
 * Shared error surface. Minimal, flat, consistent with the design system —
 * structure from a hairline border, not shadow. Used by every route error
 * boundary so failures look intentional, not broken.
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
  return (
    <div
      className={
        fullScreen
          ? "flex min-h-screen items-center justify-center bg-[var(--relay-bg)] px-6 text-[var(--relay-ink)]"
          : "flex flex-1 items-center justify-center px-6 py-24"
      }
    >
      <div className="w-full max-w-sm">
        <div className="mb-5 h-px w-10 bg-[var(--relay-ink)]" />
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--relay-faint)]">
          {kicker}
        </p>
        <h1 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[var(--relay-ink)]">
          {title}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--relay-muted)]">
          {description}
        </p>
        <div className="mt-6 flex items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center justify-center rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 text-[13px] font-medium text-[var(--relay-bg)] transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-9 items-center justify-center rounded-[var(--relay-radius-sm)] border border-[var(--relay-line-strong)] px-4 text-[13px] font-medium text-[var(--relay-ink)] transition-colors hover:bg-[var(--relay-soft)]"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
