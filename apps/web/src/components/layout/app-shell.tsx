import Link from "next/link"
import type { PropsWithChildren } from "react"

import { getAuthServer } from "@/lib/auth/server"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { ThemeToggle } from "@/components/ui/theme-toggle"

export async function AppShell({ children }: PropsWithChildren) {
  const auth = getAuthServer()
  const { data } = auth ? await auth.getSession() : { data: null }
  const user = data?.user

  return (
    <div className="min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-5 lg:px-8 lg:py-6">
        <header className="sticky top-3 z-30 flex items-center justify-between gap-4 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/92 px-4 py-3 shadow-[var(--relay-shadow-sm)] backdrop-blur-lg">
          <div className="flex items-center gap-5">
            <Link href="/" className="text-[15px] font-bold tracking-tight text-[var(--relay-ink)]">
              Relay
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link className="rounded-[var(--relay-radius-sm)] px-3 py-1.5 text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]" href="/dashboard">
                Dashboard
              </Link>
              <Link className="rounded-[var(--relay-radius-sm)] px-3 py-1.5 text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]" href="/settings">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <span className="hidden text-sm text-[var(--relay-ink-secondary)] sm:inline">
                  {user.name || user.email || "Signed in"}
                </span>
                <SignOutButton />
              </>
            ) : (
              <Link
                className="rounded-[var(--relay-radius-sm)] px-3 py-1.5 text-sm font-medium text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
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
