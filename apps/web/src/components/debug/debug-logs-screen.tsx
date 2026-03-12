"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { TelemetryLogRow, TelemetrySurface } from "@relay/shared"

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

type TelemetryLevel = "debug" | "info" | "warn" | "error"

export interface DebugLogFilters {
  surface?: TelemetrySurface
  requestId?: string
  flowId?: string
  userId?: string
  projectId?: string
  level?: TelemetryLevel
  limit: number
}

function buildQueryString(filters: DebugLogFilters) {
  const params = new URLSearchParams()

  if (filters.surface) params.set("surface", filters.surface)
  if (filters.level) params.set("level", filters.level)
  if (filters.requestId) params.set("requestId", filters.requestId)
  if (filters.flowId) params.set("flowId", filters.flowId)
  if (filters.userId) params.set("userId", filters.userId)
  if (filters.projectId) params.set("projectId", filters.projectId)
  if (filters.limit) params.set("limit", String(filters.limit))

  return params.toString()
}

export function DebugLogsScreen({ initialFilters }: { initialFilters: DebugLogFilters }) {
  const [logs, setLogs] = useState<TelemetryLogRow[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const queryString = buildQueryString(initialFilters)

  useEffect(() => {
    let cancelled = false

    async function loadLogs() {
      setLoading(true)
      setErrorMessage(null)

      try {
        const response = await fetch(`/api/debug/logs${queryString ? `?${queryString}` : ""}`, {
          cache: "no-store"
        })
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
          logs?: TelemetryLogRow[]
        }

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load developer logs.")
        }

        if (!cancelled) {
          setLogs(payload.logs ?? [])
        }
      } catch (error) {
        if (!cancelled) {
          setLogs([])
          setErrorMessage(error instanceof Error ? error.message : "Unable to load developer logs.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadLogs()

    return () => {
      cancelled = true
    }
  }, [queryString])

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
          <select name="surface" defaultValue={initialFilters.surface ?? ""} className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm">
            {surfaceOptions.map((surface) => (
              <option key={surface || "all"} value={surface}>
                {surface || "All surfaces"}
              </option>
            ))}
          </select>
          <input name="level" defaultValue={initialFilters.level ?? ""} placeholder="level" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="requestId" defaultValue={initialFilters.requestId ?? ""} placeholder="requestId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="flowId" defaultValue={initialFilters.flowId ?? ""} placeholder="flowId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="userId" defaultValue={initialFilters.userId ?? ""} placeholder="userId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="projectId" defaultValue={initialFilters.projectId ?? ""} placeholder="projectId" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm" />
          <input name="limit" defaultValue={String(initialFilters.limit)} placeholder="limit" className="rounded-xl border border-[var(--relay-line)] bg-white px-3 py-2 text-sm md:col-span-1" />
          <button type="submit" className="rounded-xl bg-[var(--relay-ink)] px-4 py-2 text-sm font-medium text-white md:col-span-1">
            Filter
          </button>
        </form>

        {errorMessage ? (
          <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

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
              {!loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--relay-muted)]">
                    No logs match the current filters.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--relay-muted)]">
                    Loading logs…
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
