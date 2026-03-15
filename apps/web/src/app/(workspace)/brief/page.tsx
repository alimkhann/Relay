import { redirect } from "next/navigation"

import { EmptyState } from "@/components/ui/empty-state"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { WorkspaceSnapshotSeed } from "@/components/layout/workspace-snapshot-seed"
import { BriefPageContent } from "@/features/brief/brief-page-content"
import { requirePageViewer } from "@/server/policies/viewer"
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service"

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

  const dashboard = await getProjectDashboardForUser(
    viewer.userId,
    currentProject.id,
  )

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="brief.viewed"
        message="Rendered the brief page."
        context={{ projectId: currentProject.id }}
      />
      {dashboard && (
        <WorkspaceSnapshotSeed
          snapshot={{
            kind: "brief",
            cacheKey: `brief:${currentProject.id}`,
            href: `/brief?project=${currentProject.id}`,
            project: { id: currentProject.id, name: currentProject.name },
            dashboard,
          }}
        />
      )}
      {dashboard ? (
        <BriefPageContent
          project={{ id: currentProject.id, name: currentProject.name }}
          dashboard={dashboard}
        />
      ) : (
        <EmptyState
          title="No data yet"
          description="Briefs will appear after your first chat capture."
          className="py-12"
        />
      )}
    </>
  )
}
