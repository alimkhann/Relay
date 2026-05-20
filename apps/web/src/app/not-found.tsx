import Link from "next/link"

export const metadata = {
  title: "Not found · Relay",
}

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--relay-bg)] px-6 text-[var(--relay-ink)]">
      <div className="pointer-events-none absolute inset-0 relay-404-grid" aria-hidden />
      <div className="relative flex flex-col items-center gap-9">
        <div className="relay-earth-wrap" aria-hidden>
          <div className="relay-earth-shadow" />
          <div className="relay-earth">
            <div className="relay-earth-map" />
            <span className="relay-earth-shine" />
            <span className="relay-earth-ring relay-earth-ring-a" />
            <span className="relay-earth-ring relay-earth-ring-b" />
          </div>
        </div>

        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--relay-faint)]">
            Error 404
          </p>
          <h1 className="mt-3 text-[28px] font-semibold">
            This context is off-world
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-[var(--relay-muted)]">
            The page you opened is outside Relay&apos;s known map. Head back to
            your dashboard and pick up the project trail from there.
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-flex h-10 items-center justify-center rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 text-[13px] font-medium text-[var(--relay-bg)] transition-opacity hover:opacity-90"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
