export default function BriefLoading() {
  return (
    <div className="space-y-6 pt-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
          Briefs
        </h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          AI-ready context packets generated from your project state.
        </p>
      </div>

      {/* Brief cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--relay-line)]">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-4 w-20 animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--relay-soft)]" />
              </div>
              <div className="flex items-center gap-1">
                <div className="h-5 w-12 animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-5 w-10 animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-5 w-20 animate-pulse rounded bg-[var(--relay-soft)]" />
              </div>
            </div>
            <div className="px-4 py-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--relay-soft)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
