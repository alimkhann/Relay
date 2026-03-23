import { redirect } from "next/navigation"

import { CreateProjectForm } from "@/components/projects/create-project-form"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { DashboardContent } from "@/features/projects/dashboard-content"
import { logServerEvent } from "@/server/logging/logger"
import { requirePageViewer } from "@/server/policies/viewer"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const viewer = await requirePageViewer("/dashboard")
  const projects = await listProjectsForUser(viewer.userId)
  const onboarding = await getResolvedOnboardingStateForUser(viewer.userId, { projects })

  if (onboarding.status === "pending") {
    await logServerEvent({
      level: "info",
      surface: "web-dashboard",
      area: "onboarding",
      event: "dashboard.onboarding_pending",
      message: "Rendered the dashboard onboarding state for a user with pending setup.",
      userId: viewer.userId,
    })

    return (
      <>
        <PageTelemetry
          surface="web-dashboard"
          area="page"
          event="dashboard_viewed"
          message="Rendered the dashboard."
          context={{
            hasProject: false,
            onboardingStatus: onboarding.status,
            projectId: null,
          }}
        />
        <section className="py-10">
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
      </>
    )
  }

  const { project: selectedProjectId } = await searchParams
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : projects.find((p) => p.id === onboarding.completedProjectId)) ??
    projects[0] ??
    null

  // Canonicalize URL so sidebar and dashboard always agree on project
  if (!selectedProjectId && currentProject) {
    redirect(`/dashboard?project=${currentProject.id}`)
  }

  const dashboard = currentProject
    ? await getProjectDashboardForUser(viewer.userId, currentProject.id)
    : null

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="dashboard_viewed"
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
    </>
  )
}
