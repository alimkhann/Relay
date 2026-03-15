import type { ReactNode } from "react"

import { SidebarProvider } from "@/components/layout/sidebar-context"
import { SidebarMainArea } from "@/components/layout/sidebar-main-area"
import { WorkspaceSidebarShell } from "@/components/layout/workspace-sidebar-shell"
import { WorkspaceLayoutViewport } from "@/components/layout/workspace-cache"
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer"
import { listProjectsForUser } from "@/server/services/project-service"

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode
}) {
  const viewer = await requirePageViewer("/dashboard")
  await syncViewerProfile(viewer)
  const projects = await listProjectsForUser(viewer.userId)

  const sidebarUser = {
    name: viewer.name || viewer.email || "Signed in",
    email: viewer.email ?? undefined,
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
        <WorkspaceSidebarShell
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          user={sidebarUser}
        />

        <SidebarMainArea>
          <div className="mx-auto max-w-4xl p-8 lg:p-12">
            <WorkspaceLayoutViewport>
              {children}
            </WorkspaceLayoutViewport>
          </div>
        </SidebarMainArea>
      </div>
    </SidebarProvider>
  )
}
