"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { withAuthCallbackParams } from "@/lib/auth/auth-callback"
import { Button } from "@/components/ui/button"
import type { WebAuthIntent } from "@/server/policies/viewer"

export function LocalSignInForm({
  nextPath = "/dashboard",
  intent = "sign-in",
}: {
  nextPath?: string
  intent?: WebAuthIntent
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const fieldClass =
    "h-14 w-full rounded-[var(--relay-radius)] border border-[var(--relay-line-strong)] bg-[var(--relay-surface-raised)] px-4 text-[15px] text-[var(--relay-ink)] outline-none transition placeholder:text-[var(--relay-faint)] focus:border-[var(--relay-muted)] focus:ring-0 [-webkit-text-fill-color:var(--relay-ink)] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--relay-surface-raised)] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--relay-ink)]"

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          setError(null)
          const flowId = createClientFlowId("local-auth")
          let receivedResponse = false

          logClientEvent({
            level: "info",
            surface: "web-auth",
            area: "auth",
            event: "local_sign_in.started",
            flowId,
            message: "User started local sign-in from the web app.",
            context: {
              authMethod: "local",
              authIntent: intent,
            },
          })

          try {
            const response = await fetch("/api/auth/local", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-relay-flow-id": flowId,
              },
              body: JSON.stringify({
                email,
                name: name || null,
                intent,
              }),
            })
            receivedResponse = true

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as {
                error?: string
              } | null
              throw new Error(payload?.error ?? "Local sign-in failed.")
            }

            router.replace(withAuthCallbackParams(nextPath, { method: "local", intent }))
            router.refresh()
          } catch (cause) {
            if (!receivedResponse) {
              logClientEvent({
                level: "error",
                surface: "web-auth",
                area: "auth",
                event: "local_sign_in.failed",
                flowId,
                message: "Local sign-in failed before the auth API responded.",
                context: {
                  authMethod: "local",
                  authIntent: intent,
                  failureStage: "request",
                },
                error: cause,
              })
            }
            setError(cause instanceof Error ? cause.message : "Local sign-in failed.")
          }
        })
      }}
    >
      <label className="block space-y-2">
        <span className="text-[13px] font-medium text-[var(--relay-ink-secondary)]">Email address</span>
        <input
          className={fieldClass}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </label>
      <label className="block space-y-2">
        <span className="text-[13px] font-medium text-[var(--relay-ink-secondary)]">Full name</span>
        <input
          className={fieldClass}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          autoComplete="name"
        />
      </label>
      <Button
        className="h-14 w-full rounded-[var(--relay-radius)] bg-[var(--relay-accent)] px-6 text-[15px] font-semibold text-[var(--relay-accent-text)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
        disabled={pending || email.trim().length === 0}
        type="submit"
      >
        {pending ? "Signing in…" : "Continue locally"}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </form>
  )
}
