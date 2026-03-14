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

  if (onboarding.status === "pending") {
    await logServerEvent({
      level: "info",
      surface: "web-dashboard",
      area: "onboarding",
      event: "dashboard.onboarding_pending",
      message: "Rendered the dashboard onboarding state for a user with pending setup.",
      userId: viewer.userId,
    });

    return (
      <AppShell
        account={{
          name: viewer.name,
          email: viewer.email,
        }}
      >
        <PageTelemetry
          surface="web-dashboard"
          area="page"
          event="dashboard.viewed"
          message="Rendered the dashboard."
          context={{
            hasProject: false,
            onboardingStatus: onboarding.status,
            projectId: null,
          }}
        />
        <section className="max-w-2xl py-10">
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
      </AppShell>
    );
  }

  const { project: selectedProjectId } = await searchParams;
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : projects.find((p) => p.id === onboarding.completedProjectId)) ??
    projects[0] ??
    null;
  const dashboard = currentProject
    ? await getProjectDashboardForUser(viewer.userId, currentProject.id)
    : null;

  return (
    <AppShell
      account={{
        name: viewer.name,
        email: viewer.email,
      }}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      currentProjectId={currentProject?.id}
      workspaceSnapshot={
        currentProject && dashboard
          ? {
              kind: "dashboard",
              cacheKey: `dashboard:${currentProject.id}`,
              href: `/dashboard?project=${currentProject.id}`,
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
        event="dashboard.viewed"
        message="Rendered the dashboard."
        context={{
          hasProject: Boolean(currentProject),
          onboardingStatus: onboarding.status,
          projectId: currentProject?.id ?? null,
        }}
      />
      {dashboard && currentProject ? (
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
