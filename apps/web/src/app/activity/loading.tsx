export default function ActivityLoading() {
  return (
    <div className="mx-auto max-w-4xl p-8 lg:p-12">
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Activity
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">Loading…</p>
        </div>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4"
            >
              <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--relay-soft)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-[var(--relay-soft)]" />
                <div className="h-3 w-1/2 rounded bg-[var(--relay-soft)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
