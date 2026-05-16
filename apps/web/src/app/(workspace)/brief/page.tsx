import { redirect } from "next/navigation"

import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { BriefPageContent } from "@/features/brief/brief-page-content"
import { requirePageViewer } from "@/server/policies/viewer"
import { listProjectsForUser } from "@/server/services/project-service"
import { fireUserMilestone } from "@/server/services/user-milestones-service"

export const dynamic = "force-dynamic"

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const viewer = await requirePageViewer("/brief")
  const projects = await listProjectsForUser(viewer.userId)

  if (projects.length === 0) {
    redirect("/dashboard")
  }

  const { project: selectedProjectId } = await searchParams
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : projects[0]) ?? projects[0]!

  void fireUserMilestone(viewer.userId, "first_brief_viewed", {
    project_id: currentProject.id,
  }).catch(() => {})

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="brief"
        pageGroup="workspace"
        message="Rendered the brief page."
        context={{ projectId: currentProject.id }}
      />
      <BriefPageContent
        project={{ id: currentProject.id, name: currentProject.name }}
      />
    </>
  )
}
