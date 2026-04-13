import { notFound } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { ProjectTabs } from "@/components/projects/project-tabs"
import { SessionList } from "@/components/sessions/session-list"
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer"
import { getProjectDashboardForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function ProjectSessionsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const viewer = await requirePageViewer(`/projects/${projectId}/sessions`)
  await syncViewerProfile(viewer)
  const dashboard = await getProjectDashboardForUser(viewer.userId, projectId)

  if (!dashboard) notFound()

  return (
    <AppShell account={{ name: viewer.name, email: viewer.email }}>
      <section className="space-y-6">
        <ProjectTabs
          projectId={projectId}
          projectName={dashboard.project.name}
          active="sessions"
        />
        <SessionList sessions={dashboard.recentSessions} />
      </section>
    </AppShell>
  )
}
