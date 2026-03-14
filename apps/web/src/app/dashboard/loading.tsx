export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
      {/* Sidebar skeleton */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 w-[var(--relay-sidebar-width)] flex flex-col border-r border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-6">
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="h-5 w-12 rounded bg-[var(--relay-soft)] animate-pulse" />
          <div className="h-5 w-5 rounded bg-[var(--relay-soft)] animate-pulse" />
        </div>

        {/* Project switcher placeholder */}
        <div className="mb-4 px-2">
          <div className="h-8 w-full rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)] animate-pulse" />
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5"
            >
              <div className="h-4 w-4 rounded bg-[var(--relay-soft)] animate-pulse" />
              <div
                className="h-4 rounded bg-[var(--relay-soft)] animate-pulse"
                style={{ width: `${60 + i * 16}px` }}
              />
            </div>
          ))}
        </nav>

        {/* User area */}
        <div className="mt-auto border-t border-[var(--relay-line)] pt-4 px-2">
          <div className="flex flex-col gap-3">
            <div className="h-4 w-28 rounded bg-[var(--relay-soft)] animate-pulse" />
            <div className="h-8 w-20 rounded-full bg-[var(--relay-soft)] animate-pulse" />
          </div>
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="ml-[var(--relay-sidebar-width)] flex-1 min-h-screen">
        <div className="mx-auto max-w-4xl p-8 lg:p-12">
          <div className="pt-6">
            <div className="animate-pulse space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="h-7 w-48 rounded bg-[var(--relay-soft)]" />
                  <div className="h-4 w-80 rounded bg-[var(--relay-soft)]" />
                </div>
                <div className="h-7 w-24 rounded bg-[var(--relay-soft)]" />
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-16 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]"
                  />
                ))}
              </div>

              {/* Memory + Brief cards */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
                    <div className="h-4 w-16 rounded bg-[var(--relay-soft)]" />
                    <div className="h-4 w-10 rounded bg-[var(--relay-soft)]" />
                  </div>
                  <div className="px-3.5 py-3 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="h-3 w-16 rounded bg-[var(--relay-soft)]" />
                        <div className="h-4 w-full rounded bg-[var(--relay-soft)]" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
                    <div className="h-4 w-24 rounded bg-[var(--relay-soft)]" />
                    <div className="h-4 w-16 rounded bg-[var(--relay-soft)]" />
                  </div>
                  <div className="px-3.5 py-3 space-y-3">
                    <div className="h-4 w-20 rounded bg-[var(--relay-soft)]" />
                    <div className="space-y-1.5">
                      <div className="h-4 w-full rounded bg-[var(--relay-soft)]" />
                      <div className="h-4 w-full rounded bg-[var(--relay-soft)]" />
                      <div className="h-4 w-3/4 rounded bg-[var(--relay-soft)]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Governance cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
                  >
                    <div className="px-3.5 py-2.5 border-b border-[var(--relay-line)]">
                      <div className="h-4 w-20 rounded bg-[var(--relay-soft)]" />
                    </div>
                    <div className="px-3.5 py-3 space-y-2">
                      {Array.from({ length: 2 }).map((_, j) => (
                        <div key={j} className="h-4 w-full rounded bg-[var(--relay-soft)]" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
