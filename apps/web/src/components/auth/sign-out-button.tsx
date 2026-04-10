"use client"

import { useState } from "react"

export function SignOutButton() {
  const [pending, setPending] = useState(false)

  return (
    <form
      action="/auth/sign-out"
      method="POST"
      onSubmit={() => setPending(true)}
    >
      <button
        className="rounded-full border border-[var(--relay-line)] bg-[var(--relay-soft)] px-4 py-2 text-sm font-medium text-[var(--relay-ink)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </form>
  )
}
