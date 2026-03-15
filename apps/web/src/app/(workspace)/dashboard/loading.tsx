export default function DashboardLoading() {
  return (
    <div className="pt-6">
      <div className="space-y-6">
        {/* Header — project name + status pill + rebuild button */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-48 animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--relay-soft)]" />
            </div>
            <div className="h-4 w-80 animate-pulse rounded bg-[var(--relay-soft)]" />
          </div>
          <div className="h-7 w-[82px] animate-pulse rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]" />
        </div>

        {/* Stats row — real labels, skeleton values */}
        <div className="grid grid-cols-3 gap-3">
          {["Chats", "Context", "Brief"].map((label) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-3 py-2.5"
            >
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-[var(--relay-soft)]" />
              <div>
                <div className="h-4 w-8 animate-pulse rounded bg-[var(--relay-soft)]" />
                <p className="mt-1 text-[11px] text-[var(--relay-muted)]">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Memory + Brief cards */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Memory card */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span className="text-xs font-medium text-[var(--relay-ink)]">Memory</span>
              <div className="h-4 w-10 animate-pulse rounded bg-[var(--relay-soft)]" />
            </div>
            <div className="px-3.5 py-3 space-y-3">
              {["Overview", "Objective", "Progress"].map((label) => (
                <div key={label} className="space-y-1.5">
                  <p className="text-[11px] font-medium text-[var(--relay-muted)]">{label}</p>
                  <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
                </div>
              ))}
            </div>
          </div>
          {/* Brief card */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span className="text-xs font-medium text-[var(--relay-ink)]">Project Brief</span>
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--relay-soft)]" />
            </div>
            <div className="px-3.5 py-3 space-y-3">
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--relay-soft)]" />
              <div className="space-y-1.5">
                <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-4 w-full animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--relay-soft)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity card */}
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
            <span className="text-xs font-medium text-[var(--relay-ink)]">Recent Activity</span>
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
          {["Decisions", "Open Tasks", "Constraints"].map((label) => (
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
    </div>
  );
}
