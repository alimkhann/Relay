import { AppShell } from "@/components/layout/app-shell";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { DashboardContent } from "@/features/projects/dashboard-content";
import { logServerEvent } from "@/server/logging/logger";
import { requirePageViewer } from "@/server/policies/viewer";
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const viewer = await requirePageViewer("/dashboard");
  const projects = await listProjectsForUser(viewer.userId);
  const { project: selectedProjectId } = await searchParams;
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : projects[0]) ??
    projects[0] ??
    null;
  const dashboard = currentProject
    ? await getProjectDashboardForUser(viewer.userId, currentProject.id)
    : null;

  if (!currentProject) {
    await logServerEvent({
      level: "info",
      surface: "web-dashboard",
      area: "onboarding",
      event: "dashboard.empty_state",
      message: "Rendered the dashboard empty state for a user with no projects.",
      userId: viewer.userId,
    });
  }

  return (
    <AppShell
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      currentProjectId={currentProject?.id}
    >
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="dashboard.viewed"
        message="Rendered the dashboard."
        context={{
          hasProject: Boolean(currentProject),
          projectId: currentProject?.id ?? null,
        }}
      />
      {/* ─── First-run: no projects ─── */}
      {!currentProject ? (
        <section className="py-10 max-w-2xl">
          <header className="mb-10 space-y-2">
            <h1 className="text-[28px] font-medium tracking-tight text-[var(--relay-ink)]">
              Welcome to Relay
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--relay-muted)]">
              Relay provides reliable, context-aware memory for your AI tools. Start by defining a project boundary.
            </p>
          </header>
          <CreateProjectForm />
        </section>
      ) : dashboard ? (
        <div className="pt-6">
          <DashboardContent
            key={currentProject.id}
            project={{
              id: currentProject.id,
              name: currentProject.name,
              description: currentProject.description,
            }}
            dashboard={dashboard}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
