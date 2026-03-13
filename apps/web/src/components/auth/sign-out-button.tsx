"use client"

import { useFormStatus } from "react-dom"

import { signOutAction } from "./sign-out-action"

function SignOutSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      className="rounded-full border border-[var(--relay-line)] bg-[var(--relay-soft)] px-4 py-2 text-sm font-medium text-[var(--relay-ink)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  )
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SignOutSubmitButton />
    </form>
  )
}
