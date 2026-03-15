export default function SettingsLoading() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">Settings</h1>
      <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
        Configure how Relay works across your chats.
      </p>

      <div className="mt-8 space-y-8">
        {/* Extension status */}
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 space-y-3">
          <p className="text-sm font-medium text-[var(--relay-ink)]">Extension</p>
          <div className="h-4 w-48 animate-pulse rounded bg-[var(--relay-soft)]" />
        </div>

        {/* Platforms */}
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 space-y-3">
          <p className="text-sm font-medium text-[var(--relay-ink)]">Platforms</p>
          <p className="text-[13px] text-[var(--relay-muted)]">
            Choose which AI tools Relay captures from.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-2">
                <div className="h-4 w-20 animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-6 w-10 animate-pulse rounded-full bg-[var(--relay-soft)]" />
              </div>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 space-y-3">
          <p className="text-sm font-medium text-[var(--relay-ink)]">Theme</p>
          <div className="h-8 w-48 animate-pulse rounded bg-[var(--relay-soft)]" />
        </div>
      </div>
    </div>
  );
}
