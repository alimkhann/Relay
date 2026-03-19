"use client"

import { useState } from "react"

import { relayClientFetch } from "@/lib/telemetry/fetch"

export function McpAuthorizationConfirm({
  sessionCode,
  projectName,
  scopes,
}: {
  sessionCode: string
  projectName: string
  scopes: string[]
}) {
  const [state, setState] = useState<"idle" | "submitting" | "approved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  async function approve() {
    setState("submitting")
    setError(null)

    try {
      const response = await relayClientFetch("/api/mcp/token", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionCode })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Authorization failed." })) as { error?: string }
        throw new Error(data.error ?? "Authorization failed.")
      }

      setState("approved")
    } catch (nextError) {
      setState("error")
      setError(nextError instanceof Error ? nextError.message : "Authorization failed.")
    }
  }

  if (state === "approved") {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm font-medium text-[var(--relay-ink)]">Access approved.</p>
        <p className="text-xs text-[var(--relay-muted)]">Return to your terminal or coding tool to finish connecting Relay.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-4 py-3 text-center">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--relay-muted)]">Session code</div>
        <div className="mt-2 font-mono text-xl font-semibold tracking-[0.3em] text-[var(--relay-ink)]">{sessionCode}</div>
      </div>
      <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-3 text-sm text-[var(--relay-ink)]">
        <p><span className="font-medium">Project:</span> {projectName}</p>
        <p className="mt-2 font-medium">Scopes:</p>
        <ul className="mt-1 space-y-1 text-[var(--relay-muted)]">
          {scopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
      </div>
      {error ? <p className="text-center text-sm text-[var(--relay-danger)]">{error}</p> : null}
      <button
        type="button"
        onClick={approve}
        disabled={state === "submitting"}
        className="w-full rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {state === "submitting" ? "Approving..." : "Approve MCP access"}
      </button>
    </div>
  )
}
