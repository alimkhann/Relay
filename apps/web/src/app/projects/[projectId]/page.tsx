import { notFound } from "next/navigation"

import { CanonView } from "@/components/canon/canon-view"
import { AppShell } from "@/components/layout/app-shell"
import { ProjectTabs } from "@/components/projects/project-tabs"
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer"
import { listProjectCanon } from "@/server/services/project-canon-service"
import { getProjectDashboardForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const viewer = await requirePageViewer(`/projects/${projectId}`)
  await syncViewerProfile(viewer)

  const [dashboard, canon] = await Promise.all([
    getProjectDashboardForUser(viewer.userId, projectId),
    listProjectCanon(viewer.userId, projectId, { includeEvidence: true }).catch(() => []),
  ])

  if (!dashboard) notFound()

  return (
    <AppShell account={{ name: viewer.name, email: viewer.email }}>
      <section className="space-y-6">
        <ProjectTabs
          projectId={projectId}
          projectName={dashboard.project.name}
          active="canon"
        />
        <CanonView canon={canon} />
      </section>
    </AppShell>
  )
}
