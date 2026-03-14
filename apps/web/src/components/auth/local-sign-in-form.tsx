"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { Button } from "@/components/ui/button"

export function LocalSignInForm({
  nextPath = "/dashboard",
}: {
  nextPath?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          setError(null)
          const flowId = createClientFlowId("local-auth")

          logClientEvent({
            level: "info",
            surface: "web-auth",
            area: "auth",
            event: "local_sign_in.started",
            flowId,
            message: "User started local sign-in from the web app.",
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
              }),
            })

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as {
                error?: string
              } | null
              throw new Error(payload?.error ?? "Local sign-in failed.")
            }

            router.replace(nextPath)
            router.refresh()
          } catch (cause) {
            logClientEvent({
              level: "error",
              surface: "web-auth",
              area: "auth",
              event: "local_sign_in.failed",
              flowId,
              message: "Local sign-in failed before navigation completed.",
              error: cause,
            })
            setError(cause instanceof Error ? cause.message : "Local sign-in failed.")
          }
        })
      }}
    >
      <input
        className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-black/30"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <input
        className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-black/30"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Display name (optional)"
        autoComplete="name"
      />
      <Button
        className="w-full rounded-xl bg-[#111210] px-6 py-3 text-white shadow-sm transition-all hover:bg-[#2a2d2a] hover:shadow-md"
        disabled={pending || email.trim().length === 0}
        type="submit"
      >
        {pending ? "Signing in…" : "Continue locally"}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </form>
  )
}
