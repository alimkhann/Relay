import { AppShell } from "@/components/layout/app-shell";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { DashboardContent } from "@/features/projects/dashboard-content";
import { logServerEvent } from "@/server/logging/logger";
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer";
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service";
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
  await syncViewerProfile(viewer);
  const projects = await listProjectsForUser(viewer.userId);
  const onboarding = await getResolvedOnboardingStateForUser(viewer.userId, { projects });
  const { project: selectedProjectId } = await searchParams;
  const currentProject =
    (onboarding.status === "completed" && selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : onboarding.status === "completed"
        ? projects.find((p) => p.id === onboarding.completedProjectId)
        : null) ??
    (onboarding.status === "completed" ? projects[0] : null) ??
    null;
  const displayProject = onboarding.status === "completed" ? currentProject : null;
  const dashboard = currentProject
    ? await getProjectDashboardForUser(viewer.userId, currentProject.id)
    : null;

  if (onboarding.status === "pending") {
    await logServerEvent({
      level: "info",
      surface: "web-dashboard",
      area: "onboarding",
      event: "dashboard.onboarding_pending",
      message: "Rendered the dashboard onboarding state for a user with pending setup.",
      userId: viewer.userId,
    });
  }

  return (
    <AppShell
      account={{
        name: viewer.name,
        email: viewer.email,
      }}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      currentProjectId={currentProject?.id}
      workspaceSnapshot={{
        kind: "dashboard",
        cacheKey: currentProject ? `dashboard:${currentProject.id}` : "dashboard:none",
        href: currentProject ? `/dashboard?project=${currentProject.id}` : "/dashboard",
        project: currentProject
          ? {
              id: currentProject.id,
              name: currentProject.name,
              description: currentProject.description,
            }
          : null,
        dashboard: dashboard ?? null,
      }}
    >
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="dashboard.viewed"
        message="Rendered the dashboard."
        context={{
          hasProject: Boolean(currentProject),
          onboardingStatus: onboarding.status,
          projectId: currentProject?.id ?? null,
        }}
      />
      {onboarding.status === "pending" ? (
        <section className="py-10 max-w-2xl">
          <header className="mb-10 space-y-2">
            <h1 className="text-[28px] font-medium tracking-tight text-[var(--relay-ink)]">
              Welcome to Relay
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--relay-muted)]">
              Relay provides reliable, context-aware memory for your AI tools. Start by defining your first project boundary.
            </p>
          </header>
          <CreateProjectForm />
        </section>
      ) : dashboard && displayProject ? (
        <div className="pt-6">
          <DashboardContent
            key={displayProject.id}
            project={{
              id: displayProject.id,
              name: displayProject.name,
              description: displayProject.description,
            }}
            dashboard={dashboard}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
