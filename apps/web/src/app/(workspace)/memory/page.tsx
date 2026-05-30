import { redirect } from "next/navigation"

import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { MemoryPageContent } from "@/features/memory/memory-page-content"
import { requirePageViewer } from "@/server/policies/viewer"
import { listProjectsForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const viewer = await requirePageViewer("/memory")
  const projects = await listProjectsForUser(viewer.userId, { includePersonal: true })

  if (projects.length === 0) {
    redirect("/dashboard")
  }

  const { project: selectedProjectId } = await searchParams
  // Personal is selectable by explicit ?project=, but never the implicit default.
  const defaultProject = projects.find((p) => p.kind !== "personal") ?? projects[0]!
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : defaultProject) ?? defaultProject

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
      <MemoryPageContent
        project={{
          id: currentProject.id,
          name: currentProject.name,
          description: currentProject.description,
        }}
      />
    </>
  )
}
