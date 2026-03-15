export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-4xl p-8 lg:p-12">
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Settings
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">Loading…</p>
        </div>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 space-y-3"
            >
              <div className="h-4 w-24 rounded bg-[var(--relay-soft)]" />
              <div className="h-3 w-48 rounded bg-[var(--relay-soft)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
