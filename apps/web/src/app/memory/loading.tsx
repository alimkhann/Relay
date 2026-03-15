export default function MemoryLoading() {
  return (
    <div className="mx-auto max-w-4xl p-8 lg:p-12">
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Memory
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">Loading…</p>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-[var(--relay-soft)]" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
