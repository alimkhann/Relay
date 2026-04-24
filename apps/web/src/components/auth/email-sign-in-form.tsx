"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { authClient } from "@/lib/auth/client"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { withAuthCallbackParams } from "@/lib/auth/auth-callback"
import { Button } from "@/components/ui/button"
import type { WebAuthIntent } from "@/server/policies/viewer"

export function EmailSignInForm({
  nextPath = "/dashboard",
  intent = "sign-in",
}: {
  nextPath?: string
  intent?: WebAuthIntent
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"sign-in" | "sign-up">(
    intent === "sign-up" ? "sign-up" : "sign-in"
  )

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          setError(null)
          const flowId = createClientFlowId("email-auth")

          logClientEvent({
            level: "info",
            surface: "web-auth",
            area: "auth",
            event: mode === "sign-up" ? "email_sign_up.started" : "email_sign_in.started",
            flowId,
            message: `User started email ${mode} from the web app.`,
            context: { authMethod: "email", authIntent: mode },
          })

          try {
            if (mode === "sign-up") {
              const result = await authClient.signUp.email({
                email,
                password,
                name: name || email.split("@")[0] || email,
              })
              if (result.error) {
                throw new Error(result.error.message ?? "Sign-up failed.")
              }
            } else {
              const result = await authClient.signIn.email({
                email,
                password,
              })
              if (result.error) {
                throw new Error(result.error.message ?? "Sign-in failed.")
              }
            }

            logClientEvent({
              level: "info",
              surface: "web-auth",
              area: "auth",
              event: mode === "sign-up" ? "email_sign_up.succeeded" : "email_sign_in.succeeded",
              flowId,
              message: `Email ${mode} completed.`,
              context: { authMethod: "email", authIntent: mode },
            })

            router.replace(withAuthCallbackParams(nextPath, { method: "email", intent: mode }))
            router.refresh()
          } catch (cause) {
            logClientEvent({
              level: "error",
              surface: "web-auth",
              area: "auth",
              event: mode === "sign-up" ? "email_sign_up.failed" : "email_sign_in.failed",
              flowId,
              message: `Email ${mode} failed.`,
              context: { authMethod: "email", authIntent: mode },
              error: cause,
            })
            setError(cause instanceof Error ? cause.message : `Email ${mode} failed.`)
          }
        })
      }}
    >
      {mode === "sign-up" && (
        <input
          className="w-full rounded-[var(--relay-radius)] border border-[var(--relay-border)] bg-transparent px-4 py-3 text-sm text-[var(--relay-ink)] outline-none transition placeholder:text-[var(--relay-faint)] focus:border-[var(--relay-muted)]"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name (optional)"
          autoComplete="name"
        />
      )}
      <input
        className="w-full rounded-[var(--relay-radius)] border border-[var(--relay-border)] bg-transparent px-4 py-3 text-sm text-[var(--relay-ink)] outline-none transition placeholder:text-[var(--relay-faint)] focus:border-[var(--relay-muted)]"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <input
        className="w-full rounded-[var(--relay-radius)] border border-[var(--relay-border)] bg-transparent px-4 py-3 text-sm text-[var(--relay-ink)] outline-none transition placeholder:text-[var(--relay-faint)] focus:border-[var(--relay-muted)]"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={mode === "sign-up" ? "Create a password" : "Password"}
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        required
        minLength={8}
      />
      <Button
        className="w-full rounded-[var(--relay-radius)] bg-[var(--relay-ink)] px-6 py-3 text-[var(--relay-bg)] shadow-sm transition-all hover:opacity-90 hover:shadow-md"
        disabled={pending || email.trim().length === 0 || password.length < 8}
        type="submit"
      >
        {pending
          ? mode === "sign-up" ? "Creating account…" : "Signing in…"
          : mode === "sign-up" ? "Create account" : "Sign in with email"}
      </Button>
      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in")
          setError(null)
        }}
        className="w-full text-center text-xs text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
      >
        {mode === "sign-in" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </form>
  )
}
