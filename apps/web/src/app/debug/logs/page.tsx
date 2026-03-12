import Link from "next/link"

import type { TelemetrySurface } from "@relay/shared"

import { requireDebugViewer } from "@/server/logging/debug-access"
import { listTelemetryLogs } from "@/server/logging/logger"

export const dynamic = "force-dynamic"

const surfaceOptions: Array<TelemetrySurface | ""> = [
  "",
  "web-landing",
  "web-dashboard",
  "web-auth",
  "web-api",
  "extension-background",
  "extension-sidebar",
  "extension-inline-chip"
]

export default async function DebugLogsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  try {
    await requireDebugViewer()
  } catch (error) {
    return (
      <main className="min-h-screen bg-[var(--relay-background)] px-6 py-16 text-[var(--relay-ink)]">
        <div className="mx-auto max-w-2xl rounded-[20px] border border-[var(--relay-line)] bg-white/88 p-8 shadow-[var(--relay-shadow-sm)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Developer logs</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Access denied</h1>
          <p className="mt-3 text-sm text-[var(--relay-muted)]">
            {error instanceof Error ? error.message : "Debug access is not available for this account."}
          </p>
        </div>
      </main>
    )
  }
  const params = await searchParams
  const getSingle = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const filters = {
    surface: (getSingle("surface") as TelemetrySurface | undefined) ?? undefined,
    requestId: getSingle("requestId") ?? undefined,
    flowId: getSingle("flowId") ?? undefined,
    userId: getSingle("userId") ?? undefined,
    projectId: getSingle("projectId") ?? undefined,
    level: (getSingle("level") as "debug" | "info" | "warn" | "error" | undefined) ?? undefined,
    limit: getSingle("limit") ? Number(getSingle("limit")) : 100
  }

  const logs = await listTelemetryLogs(filters)

  return (
    <main className="min-h-screen bg-[var(--relay-background)] px-6 py-10 text-[var(--relay-ink)]">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Developer logs</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Telemetry log stream</h1>
          </div>
          <Link href="/dashboard" className="text-sm text-[var(--relay-muted)] underline underline-offset-4">
            Back to dashboard
          </Link>
        </div>

        <form className="grid gap-3 rounded-[20px] border border-[var(--relay-line)] bg-white/80 p-4 md:grid-cols-6">
          <select name="surface" defaultValue={filters.surface ?? ""} className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm">
            {surfaceOptions.map((surface) => (
              <option key={surface || "all"} value={surface}>
                {surface || "All surfaces"}
              </option>
            ))}
          </select>
          <input name="level" defaultValue={filters.level ?? ""} placeholder="level" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="requestId" defaultValue={filters.requestId ?? ""} placeholder="requestId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="flowId" defaultValue={filters.flowId ?? ""} placeholder="flowId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="userId" defaultValue={filters.userId ?? ""} placeholder="userId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="projectId" defaultValue={filters.projectId ?? ""} placeholder="projectId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="limit" defaultValue={String(filters.limit ?? 100)} placeholder="limit" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm md:col-span-1" />
          <button type="submit" className="rounded-xl bg-[var(--relay-ink)] px-4 py-2 text-sm font-medium text-white md:col-span-1">
            Filter
          </button>
        </form>

        <div className="overflow-hidden rounded-[20px] border border-[var(--relay-line)] bg-white/88 shadow-[var(--relay-shadow-sm)]">
          <table className="min-w-full divide-y divide-[var(--relay-line)] text-left text-sm">
            <thead className="bg-[var(--relay-soft)] text-[var(--relay-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Surface</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Correlation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--relay-line)]">
              {logs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="px-4 py-3 text-[var(--relay-muted)]">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{log.surface}</div>
                    <div className="text-xs text-[var(--relay-muted)]">{log.level} · {log.area}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{log.event}</td>
                  <td className="px-4 py-3">
                    <div>{log.message}</div>
                    {log.error?.message ? (
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--relay-soft)] p-3 text-xs text-rose-700">
                        {log.error.message}
                        {log.error.stack ? `\n${log.error.stack}` : ""}
                      </pre>
                    ) : null}
                    {Object.keys(log.context).length > 0 ? (
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--relay-soft)] p-3 text-xs text-[var(--relay-muted)]">
                        {JSON.stringify(log.context, null, 2)}
                      </pre>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--relay-muted)]">
                    <div>request: {log.requestId ?? "—"}</div>
                    <div>flow: {log.flowId ?? "—"}</div>
                    <div>user: {log.userId ?? "—"}</div>
                    <div>project: {log.projectId ?? "—"}</div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--relay-muted)]">
                    No logs match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
