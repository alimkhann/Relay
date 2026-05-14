export default function SourcesLoading() {
  return (
    <div className="space-y-4 pt-6">
      <div>
        <div className="h-5 w-28 rounded bg-[var(--relay-soft)]" />
        <div className="mt-2 h-4 w-72 rounded bg-[var(--relay-soft)]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <div className="h-[420px] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
        <div className="h-[420px] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
      </div>
    </div>
  )
}
