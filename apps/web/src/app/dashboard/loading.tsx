export default function DashboardLoading() {
  return (
    <div className="pt-6">
      <div className="animate-pulse space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="h-7 w-48 rounded bg-[var(--relay-soft)]" />
            <div className="h-4 w-80 rounded bg-[var(--relay-soft)]" />
          </div>
          <div className="h-7 w-24 rounded bg-[var(--relay-soft)]" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-16 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="h-72 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
          <div className="h-72 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
        </div>
      </div>
    </div>
  );
}
