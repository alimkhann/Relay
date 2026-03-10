"use client"

import { useState, useTransition } from "react"

import { authClient } from "@/lib/auth/client"
import { Button } from "@/components/ui/button"

export function GoogleSignInButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <Button
        className="min-w-[220px] bg-[#142114] px-6 py-3 text-white hover:bg-[#0f190f]"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)

            try {
              await authClient.signIn.social({
                provider: "google",
                callbackURL: "/dashboard"
              })
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Google sign-in failed.")
            }
          })
        }>
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  )
}
