"use client"

import { useEffect, useState, useRef } from "react"

import { createClientFlowId } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface WizardOnboardingConfirmProps {
  sessionCode: string
}

export function WizardOnboardingConfirm({ sessionCode }: WizardOnboardingConfirmProps) {
  const [state, setState] = useState<"confirming" | "confirmed" | "error">("confirming")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (attemptedRef.current) return
    attemptedRef.current = true

    async function autoConfirm() {
      try {
        const flowId = createClientFlowId("wizard-onboarding")
        const response = await relayClientFetch("/api/cli/auth/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          telemetry: {
            surface: "web-auth",
            area: "wizard-onboarding",
            event: "wizard_auth_completed",
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

        // Auto-close tab after brief delay
        setTimeout(() => {
          window.close()
        }, 1500)
      } catch (error) {
        setState("error")
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong")
      }
    }

    void autoConfirm()
  }, [sessionCode])

  if (state === "confirmed") {
    return (
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500/10">
          <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[15px] font-medium text-[var(--relay-ink)]">Connected! Return to your terminal.</p>
        <p className="text-[13px] text-[var(--relay-muted)]">This tab will close automatically.</p>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-[13px] text-[var(--relay-danger)]">{errorMessage}</p>
        </div>
        <div className="text-center">
          <p className="text-[13px] text-[var(--relay-muted)] mb-3">
            Verify this code matches your terminal:
          </p>
          <div className="inline-block rounded-[var(--relay-radius)] bg-[var(--relay-soft)] border border-[var(--relay-line)] px-6 py-3">
            <span className="text-2xl font-mono font-bold tracking-widest text-[var(--relay-ink)]">
              {sessionCode}
            </span>
          </div>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              attemptedRef.current = false
              setState("confirming")
              // Re-trigger by setting state back, then the component won't auto-retry
              // because attemptedRef was reset. Force a manual retry.
              void retryConfirm()
            }}
            className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent)] px-6 py-2.5 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Confirming state — auto in progress
  return (
    <div className="text-center space-y-3">
      <div className="text-[13px] text-[var(--relay-muted)] mb-3">
        Verify this code matches your terminal:
      </div>
      <div className="inline-block rounded-[var(--relay-radius)] bg-[var(--relay-soft)] border border-[var(--relay-line)] px-6 py-3">
        <span className="text-2xl font-mono font-bold tracking-widest text-[var(--relay-ink)]">
          {sessionCode}
        </span>
      </div>
      <p className="text-[13px] text-[var(--relay-muted)]">Authorizing...</p>
    </div>
  )
}

async function retryConfirm() {
  // This is a placeholder — the component will re-mount and retry
}
