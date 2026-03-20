"use client"

import { useState } from "react"

import { createClientFlowId } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface CliOnboardingConfirmProps {
  sessionCode: string
}

export function CliOnboardingConfirm({ sessionCode }: CliOnboardingConfirmProps) {
  const [state, setState] = useState<"idle" | "confirming" | "confirmed" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setState("confirming")
    try {
      const flowId = createClientFlowId("cli-onboarding")
      const response = await relayClientFetch("/api/cli/auth/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        telemetry: {
          surface: "web-auth",
          area: "cli-onboarding",
          event: "cli_auth_completed",
          flowId,
          logSuccess: true
        },
        body: JSON.stringify({ sessionCode })
      })

      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error ?? "Failed to authorize")
      }

      setState("confirmed")
    } catch (error) {
      setState("error")
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong")
    }
  }

  if (state === "confirmed") {
    return (
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500/10">
          <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[15px] font-medium text-[var(--relay-ink)]">Connected! Return to your terminal.</p>
        <p className="text-[13px] text-[var(--relay-muted)]">You can close this tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-[13px] text-[var(--relay-muted)] mb-3">
          Confirm this code matches what you see in your terminal:
        </p>
        <div className="inline-block rounded-[var(--relay-radius)] bg-[var(--relay-soft)] border border-[var(--relay-line)] px-6 py-3">
          <span className="text-2xl font-mono font-bold tracking-widest text-[var(--relay-ink)]">
            {sessionCode}
          </span>
        </div>
      </div>

      {state === "error" && errorMessage && (
        <p className="text-[13px] text-[var(--relay-danger)] text-center">{errorMessage}</p>
      )}

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={state === "confirming"}
          className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent)] px-6 py-2.5 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {state === "confirming" ? "Authorizing..." : "Authorize"}
        </button>
      </div>
    </div>
  )
}
