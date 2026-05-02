import { redirect } from "next/navigation"

import { EmptyState } from "@/components/ui/empty-state"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { MemoryPageContent } from "@/features/memory/memory-page-content"
import { requirePageViewer } from "@/server/policies/viewer"
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const viewer = await requirePageViewer("/memory")
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
        pageName="memory"
        pageGroup="workspace"
        message="Rendered the memory page."
        context={{ projectId: currentProject.id }}
      />
      {dashboard ? (
        <MemoryPageContent
          project={{
            id: currentProject.id,
            name: currentProject.name,
            description: currentProject.description,
          }}
          dashboard={dashboard}
        />
      ) : (
        <EmptyState
          title="No data yet"
          description="Memory will appear after your first chat capture."
          className="py-12"
        />
      )}
    </>
  )
}
