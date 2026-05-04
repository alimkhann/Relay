export default function DashboardLoading() {
  return (
    <div className="pt-6">
      <div className="space-y-6">
        {/* Header — project name + action buttons */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-7 w-48 animate-pulse rounded bg-[var(--relay-soft)]" />
            <div className="h-4 w-72 animate-pulse rounded bg-[var(--relay-soft)]" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 animate-pulse rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]" />
            <div className="h-7 w-7 animate-pulse rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]" />
            <div className="h-7 w-7 animate-pulse rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]" />
          </div>
        </div>

        {/* Stats row — 3 stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {["Chat sessions", "Memory items", "Brief status"].map((label) => (
            <div
              key={label}
              className="border border-[var(--relay-line)] rounded-lg p-4 bg-[var(--relay-surface)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--relay-soft)]">
                  <div className="h-4 w-4 animate-pulse rounded bg-[var(--relay-soft)]" />
                </div>
                <div className="space-y-1">
                  <div className="h-7 w-10 animate-pulse rounded bg-[var(--relay-soft)]" />
                  <p className="text-sm leading-snug">{label}</p>
                  <div className="h-3 w-24 animate-pulse rounded bg-[var(--relay-soft)]" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Analytics bar */}
        <div className="flex items-center gap-3">
          <div className="h-3.5 w-36 animate-pulse rounded bg-[var(--relay-soft)]" />
          <span className="text-xs text-[var(--relay-muted)]">·</span>
          <div className="h-3.5 w-32 animate-pulse rounded bg-[var(--relay-soft)]" />
        </div>

        {/* Memory + Brief cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Memory card */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span className="text-xs font-medium text-[var(--relay-ink)]">Memory</span>
              <div className="h-3.5 w-14 animate-pulse rounded bg-[var(--relay-soft)]" />
            </div>
            <div className="px-3.5 py-3 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-[var(--relay-soft)]" />
            </div>
          </div>
          {/* Brief card */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span className="text-xs font-medium text-[var(--relay-ink)]">Project Brief</span>
              <div className="h-3.5 w-14 animate-pulse rounded bg-[var(--relay-soft)]" />
            </div>
            <div className="px-3.5 py-3 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--relay-soft)]" />
            </div>
          </div>
        </div>

        {/* Recent Activity card */}
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-pulse rounded bg-[var(--relay-soft)]" />
              <span className="text-sm font-medium text-[var(--relay-ink)]">Recent Activity</span>
              <div className="h-5 w-6 animate-pulse rounded-full bg-[var(--relay-soft)]" />
            </div>
            <div className="h-3.5 w-14 animate-pulse rounded bg-[var(--relay-soft)]" />
          </div>
          <div className="divide-y divide-[var(--relay-line)]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-[var(--relay-soft)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--relay-soft)]" />
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
              className="flex flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--relay-line)]">
                <span className="text-xs font-medium text-[var(--relay-ink)]">{label}</span>
                <div className="h-3.5 w-4 animate-pulse rounded bg-[var(--relay-soft)]" />
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
    </div>
  );
}
