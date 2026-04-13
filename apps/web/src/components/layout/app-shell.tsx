import type { PropsWithChildren } from "react";

import { getAuthServer } from "@/lib/auth/server";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { SidebarMainArea } from "@/components/layout/sidebar-main-area";

interface AppShellProps extends PropsWithChildren {
  projects?: { id: string; name: string }[];
  currentProjectId?: string;
  account?: {
    name?: string | null;
    email?: string | null;
  };
}

export async function AppShell({
  children,
  projects,
  currentProjectId,
  account,
}: AppShellProps) {
  let user = account ?? null;

  if (!user) {
    const auth = getAuthServer();
    const { data } = auth ? await auth.getSession() : { data: null };
    user = data?.user
      ? {
          name: data.user.name ?? null,
          email: data.user.email ?? null,
        }
      : null;
  }

  const sidebarUser = user
    ? {
        name: user.name || user.email || "Signed in",
        email: user.email ?? undefined,
      }
    : null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
        <Sidebar
          projects={projects}
          currentProjectId={currentProjectId}
          user={sidebarUser}
        />

        <SidebarMainArea>
          <div className="p-8 lg:p-12">
            {children}
          </div>
        </SidebarMainArea>
      </div>
    </SidebarProvider>
  );
}
