import Link from "next/link";
import type { PropsWithChildren } from "react";

import { getAuthServer } from "@/lib/auth/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export async function AppShell({ children }: PropsWithChildren) {
  const auth = getAuthServer();
  const { data } = auth ? await auth.getSession() : { data: null };
  const user = data?.user;

  return (
    <div className="flex min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 w-64 flex flex-col border-r border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-6">
        <div className="flex items-center justify-between mb-8 px-2">
          <Link
            href="/"
            className="text-[16px] font-bold tracking-tight text-[var(--relay-ink)]"
          >
            Relay
          </Link>
          <ThemeToggle />
        </div>
        
        <nav className="flex flex-col gap-1 text-[13px] font-medium grow">
          <Link
            className="rounded-[var(--relay-radius-sm)] px-3 py-2 text-[var(--relay-ink-secondary)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            href="/dashboard"
          >
            Overview
          </Link>
          <Link
            className="rounded-[var(--relay-radius-sm)] px-3 py-2 text-[var(--relay-ink-secondary)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            href="/settings"
          >
            Preferences
          </Link>
        </nav>

        <div className="mt-auto border-t border-[var(--relay-line)] pt-4 px-2">
          {user ? (
            <div className="flex flex-col gap-3">
              <span className="text-xs text-[var(--relay-ink-secondary)] truncate">
                {user.name || user.email || "Signed in"}
              </span>
              <div className="flex items-center justify-between">
                <SignOutButton />
              </div>
            </div>
          ) : (
            <Link
              className="text-[13px] font-medium text-[var(--relay-ink-secondary)] transition hover:text-[var(--relay-ink)]"
              href="/sign-in"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 flex-1 min-h-screen">
        <div className="mx-auto max-w-4xl p-8 lg:p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
