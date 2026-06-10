import { redirect } from "next/navigation";

import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { GraphPageContent } from "@/features/graph/graph-page-content";
import { requirePageViewer } from "@/server/policies/viewer";
import { listProjectsForUser } from "@/server/services/project-service";

export const dynamic = "force-dynamic";

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const viewer = await requirePageViewer("/graph");
  const projects = await listProjectsForUser(viewer.userId, { includePersonal: true });

  if (projects.length === 0) {
    redirect("/dashboard");
  }

  const { project: selectedProjectId } = await searchParams;
  // Personal is selectable by explicit ?project=, but never the implicit default.
  const defaultProject = projects.find((project) => project.kind !== "personal") ?? projects[0]!;
  const currentProject =
    (selectedProjectId
      ? projects.find((project) => project.id === selectedProjectId)
      : defaultProject) ?? defaultProject;

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="graph"
        pageGroup="workspace"
        message="Rendered the graph page."
        context={{ projectId: currentProject.id }}
      />
      <GraphPageContent
        project={{
          id: currentProject.id,
          name: currentProject.name,
          description: currentProject.description,
        }}
      />
    </>
  );
}
