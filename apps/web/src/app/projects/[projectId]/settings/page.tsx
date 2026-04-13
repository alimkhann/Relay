import { notFound } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { ProjectTabs } from "@/components/projects/project-tabs"
import { ProjectSettingsForm } from "@/components/projects/project-settings-form"
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer"
import { getProjectDashboardForUser } from "@/server/services/project-service"
import { getProjectSettings } from "@/server/services/project-settings-service"

export const dynamic = "force-dynamic"

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const viewer = await requirePageViewer(`/projects/${projectId}/settings`)
  await syncViewerProfile(viewer)

  const [dashboard, settings] = await Promise.all([
    getProjectDashboardForUser(viewer.userId, projectId),
    getProjectSettings(viewer.userId, projectId),
  ])

  if (!dashboard) notFound()

  return (
    <AppShell account={{ name: viewer.name, email: viewer.email }}>
      <section className="space-y-6">
        <ProjectTabs
          projectId={projectId}
          projectName={dashboard.project.name}
          active="settings"
        />
        <ProjectSettingsForm projectId={projectId} initial={settings} />
      </section>
    </AppShell>
  )
}
