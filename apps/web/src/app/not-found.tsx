import Link from "next/link"

export const metadata = {
  title: "Not found · Relay",
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-[var(--relay-bg)] px-6 text-[var(--relay-ink)]">
      <div
        className="relay-globe-spin"
        style={{ perspective: "700px" }}
        aria-hidden
      >
        <div className="relay-globe">
          <span />
          <i />
          <i />
          <i />
        </div>
      </div>

      <div className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--relay-faint)]">
          Error 404
        </p>
        <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.01em]">
          Off the map
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-[var(--relay-muted)]">
          This page doesn&apos;t exist — or moved somewhere Relay isn&apos;t
          tracking yet.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 text-[13px] font-medium text-[var(--relay-bg)] transition-opacity hover:opacity-90"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  )
}
