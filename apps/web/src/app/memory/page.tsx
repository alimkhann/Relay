import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { MemoryPageContent } from "@/features/memory/memory-page-content";
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer";
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service";

export const dynamic = "force-dynamic";

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const viewer = await requirePageViewer("/memory");
  await syncViewerProfile(viewer);
  const projects = await listProjectsForUser(viewer.userId);

  if (projects.length === 0) {
    redirect("/dashboard");
  }

  const { project: selectedProjectId } = await searchParams;
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : projects[0]) ?? projects[0]!;

  const dashboard = await getProjectDashboardForUser(
    viewer.userId,
    currentProject.id,
  );

  return (
    <AppShell
      account={{ name: viewer.name, email: viewer.email }}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      currentProjectId={currentProject.id}
      workspaceSnapshot={
        dashboard
          ? {
              kind: "memory",
              cacheKey: `memory:${currentProject.id}`,
              href: `/memory?project=${currentProject.id}`,
              project: {
                id: currentProject.id,
                name: currentProject.name,
                description: currentProject.description,
              },
              dashboard,
            }
          : undefined
      }
    >
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="memory.viewed"
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
    </AppShell>
  );
}
