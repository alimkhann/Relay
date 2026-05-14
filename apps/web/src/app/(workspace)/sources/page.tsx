import { redirect } from "next/navigation"

import { EmptyState } from "@/components/ui/empty-state"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { SourcesPageContent } from "@/features/sources/sources-page-content"
import { requirePageViewer } from "@/server/policies/viewer"
import { listProjectsForUser } from "@/server/services/project-service"
import { listProjectSources } from "@/server/services/source-service"

export const dynamic = "force-dynamic"

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const viewer = await requirePageViewer("/sources")
  const projects = await listProjectsForUser(viewer.userId)

  if (projects.length === 0) {
    redirect("/dashboard")
  }

  const { project: selectedProjectId } = await searchParams
  const currentProject =
    (selectedProjectId
      ? projects.find((project) => project.id === selectedProjectId)
      : projects[0]) ?? projects[0]!

  const sources = await listProjectSources(viewer.userId, currentProject.id)

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="sources"
        pageGroup="workspace"
        message="Rendered the sources page."
        context={{ projectId: currentProject.id }}
      />
      {currentProject ? (
        <SourcesPageContent
          project={{
            id: currentProject.id,
            name: currentProject.name,
            description: currentProject.description,
          }}
          initialSources={sources}
        />
      ) : (
        <EmptyState
          title="No project selected"
          description="Choose a project before importing sources."
          className="py-12"
        />
      )}
    </>
  )
}
