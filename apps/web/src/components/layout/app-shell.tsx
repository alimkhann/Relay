import Link from "next/link";
import type { PropsWithChildren } from "react";

import { getAuthServer } from "@/lib/auth/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SidebarProjectSwitcher } from "@/components/layout/sidebar-project-switcher";

interface AppShellProps extends PropsWithChildren {
  projects?: { id: string; name: string }[];
  currentProjectId?: string;
}

export async function AppShell({ children, projects, currentProjectId }: AppShellProps) {
  const auth = getAuthServer();
  const { data } = auth ? await auth.getSession() : { data: null };
  const user = data?.user;

  return (
    <div className="flex min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 w-[var(--relay-sidebar-width)] flex flex-col border-r border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-6">
        <div className="flex items-center justify-between mb-6 px-2">
          <Link
            href="/"
            className="text-[16px] font-bold tracking-tight text-[var(--relay-ink)]"
          >
            Relay
          </Link>
          <ThemeToggle />
        </div>

        {projects && projects.length > 0 && currentProjectId && (
          <SidebarProjectSwitcher
            projects={projects}
            currentId={currentProjectId}
          />
        )}

        <SidebarNav />

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
      <main className="ml-[var(--relay-sidebar-width)] flex-1 min-h-screen">
        <div className="mx-auto max-w-4xl p-8 lg:p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
