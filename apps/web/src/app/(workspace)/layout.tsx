import type { ReactNode } from "react"

import { AutoCaptureOnboardingBanner } from "@/components/onboarding/auto-capture-onboarding-banner"
import { SidebarProvider } from "@/components/layout/sidebar-context"
import { SidebarMainArea } from "@/components/layout/sidebar-main-area"
import { SessionKeepalive } from "@/components/auth/session-keepalive"
import { PostHogIdentity } from "@/components/telemetry/posthog-identity"
import { WorkspaceSidebarShell } from "@/components/layout/workspace-sidebar-shell"
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { listProjectsForUser } from "@/server/services/project-service"
import { getUserSettings } from "@/server/services/settings-service"

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode
}) {
  const viewer = await requirePageViewer("/dashboard")
  await syncViewerProfile(viewer)
  const [projects, onboarding, settings] = await Promise.all([
    listProjectsForUser(viewer.userId),
    getResolvedOnboardingStateForUser(viewer.userId),
    getUserSettings(viewer.userId)
  ])

  const sidebarUser = {
    name: viewer.name || viewer.email || "Signed in",
    email: viewer.email ?? undefined,
  }

  return (
    <SidebarProvider>
      <SessionKeepalive />
      <PostHogIdentity userId={viewer.userId} />
      <div className="flex min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
        <WorkspaceSidebarShell
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          user={sidebarUser}
        />

        <SidebarMainArea>
          {onboarding.status === "completed" ? <AutoCaptureOnboardingBanner settings={settings.settings} /> : null}
          <div className="mx-auto max-w-6xl p-4 sm:p-8 lg:p-12">
            {children}
          </div>
        </SidebarMainArea>
      </div>
    </SidebarProvider>
  )
}
