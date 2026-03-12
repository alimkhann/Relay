"use client"

import { useTransition } from "react"

import { authClient } from "@/lib/auth/client"

export function SignOutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      className="rounded-full border border-[var(--relay-line)] bg-white/70 px-4 py-2 text-sm font-medium text-[var(--relay-muted)] transition hover:bg-white"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut()
          window.location.assign("/sign-in")
        })
      }>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  )
}
