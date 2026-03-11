import Link from "next/link"
import type { PropsWithChildren } from "react"

import { getAuthServer } from "@/lib/auth/server"
import { SignOutButton } from "@/components/auth/sign-out-button"

export async function AppShell({ children }: PropsWithChildren) {
  const auth = getAuthServer()
  const { data } = auth ? await auth.getSession() : { data: null }
  const user = data?.user

  return (
    <div className="min-h-screen bg-[var(--relay-app-bg)] text-[var(--relay-ink)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 py-6 lg:px-8 lg:py-8">
        <header className="sticky top-4 z-30 flex flex-col gap-4 rounded-[18px] border border-[var(--relay-line)] bg-[rgba(247,245,238,0.86)] px-5 py-4 shadow-[var(--relay-shadow)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="inline-flex items-center rounded-[10px] bg-[var(--relay-accent)] px-3 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-white">
              Relay
            </Link>
            <p className="text-sm text-[var(--relay-muted)]">Fresh-chat continuity for AI work that refuses to stay still.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[var(--relay-line)] bg-white/56 px-2 py-2 text-sm text-[var(--relay-muted)]">
              <Link className="rounded-[10px] px-3 py-2 transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]" href="/dashboard">
                Dashboard
              </Link>
              <Link className="rounded-[10px] px-3 py-2 transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]" href="/settings">
                Settings
              </Link>
            </nav>
            {user ? (
              <>
                <div className="rounded-[12px] border border-[var(--relay-line)] bg-white/70 px-4 py-2 text-sm text-[var(--relay-muted)]">
                  {user.name || user.email || "Signed in"}
                </div>
                <SignOutButton />
              </>
            ) : (
              <Link
                className="rounded-[12px] border border-[var(--relay-line)] bg-white/70 px-4 py-2 text-sm font-medium text-[var(--relay-muted)] transition hover:bg-white"
                href="/sign-in">
                Sign in
              </Link>
            )}
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
