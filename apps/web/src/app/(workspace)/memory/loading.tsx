export default function MemoryLoading() {
  return (
    <div className="space-y-6 pt-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
          Memory
        </h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Project context that Relay carries forward into every brief.
        </p>
      </div>

      {/* Project State card */}
      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--relay-line)]">
          <span className="text-sm font-medium text-[var(--relay-ink)]">Project State</span>
          <div className="h-4 w-10 animate-pulse rounded bg-[var(--relay-soft)]" />
        </div>
        <div className="px-4 py-4 space-y-4">
          {["Overview", "Objective", "Progress"].map((label) => (
            <div key={label}>
              <p className="text-[11px] font-medium text-[var(--relay-muted)] mb-1">{label}</p>
              <div className="space-y-1.5">
                <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--relay-soft)]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Governance cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {["Decisions", "Tasks", "Constraints"].map((label) => (
          <div
            key={label}
            className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
          >
            <div className="px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span className="text-xs font-medium text-[var(--relay-ink)]">{label}</span>
            </div>
            <div className="px-3.5 py-3 space-y-2">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
