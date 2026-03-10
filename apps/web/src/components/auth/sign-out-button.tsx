"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth/client"

export function SignOutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      className="rounded-full border border-[var(--relay-line)] bg-white/70 px-4 py-2 text-sm font-medium text-[var(--relay-muted)] transition hover:bg-white"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut()
          router.push("/")
          router.refresh()
        })
      }>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  )
}
