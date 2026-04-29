import { redirect } from "next/navigation"

import { CreateProjectForm } from "@/components/projects/create-project-form"
import { ReferralLinkBanner } from "@/components/referral/referral-link-banner"
import { SoftPaywallPanel } from "@/components/billing/soft-paywall-panel"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { DashboardContent } from "@/features/projects/dashboard-content"
import { logServerEvent } from "@/server/logging/logger"
import { requirePageViewer } from "@/server/policies/viewer"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service"
import { resolveViewerEntitlements } from "@/server/services/entitlement-service"
import { getUserSettings } from "@/server/services/settings-service"
import { getReferralProgramForUser } from "@/server/services/referral-service"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; projectName?: string; projectDescription?: string; projectUrl?: string }>
}) {
  const viewer = await requirePageViewer("/dashboard")
  const projects = await listProjectsForUser(viewer.userId)
  const [onboarding, settings] = await Promise.all([
    getResolvedOnboardingStateForUser(viewer.userId, { projects }),
    getUserSettings(viewer.userId),
  ])

  if (onboarding.status === "pending") {
    const referralProgram = await getReferralProgramForUser(viewer.userId).catch(() => null)
    await logServerEvent({
      level: "info",
      surface: "web-dashboard",
      area: "onboarding",
      event: "onboarding_viewed",
      message: "Rendered the dashboard onboarding state for a user with pending setup.",
      userId: viewer.userId,
      context: {
        onboardingStep: "project_setup",
        onboardingStatus: onboarding.status,
      },
    })

    return (
      <>
        <PageTelemetry
          surface="web-dashboard"
          area="page"
          pageName="dashboard"
          pageGroup="workspace"
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
              Create a project
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--relay-muted)]">
              Define a project boundary so Relay can route the right chats to the right context. The extension will pick this up automatically.
            </p>
          </header>
          <CreateProjectForm
            initialName={(await searchParams).projectName ?? ""}
            initialDescription={(await searchParams).projectDescription ?? ""}
            initialProjectUrl={(await searchParams).projectUrl ?? ""}
          />
          {referralProgram ? <ReferralLinkBanner link={referralProgram.link} /> : null}
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

  const [dashboard, entitlements] = await Promise.all([
    currentProject ? getProjectDashboardForUser(viewer.userId, currentProject.id) : null,
    resolveViewerEntitlements(viewer.userId),
  ])

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="dashboard"
        pageGroup="workspace"
        message="Rendered the dashboard."
        context={{
          hasProject: Boolean(currentProject),
          onboardingStatus: onboarding.status,
          projectId: currentProject?.id ?? null,
        }}
      />
      {dashboard && currentProject ? (
        <div className="pt-6">
          {!entitlements.isPaid ? <SoftPaywallPanel /> : null}
          <DashboardContent
            key={currentProject.id}
            project={{
              id: currentProject.id,
              name: currentProject.name,
              description: currentProject.description,
              projectUrl: currentProject.projectUrl,
            }}
            dashboard={dashboard}
            walkthroughInitiallyOpen={
              !settings.settings.walkthrough?.dismissedAt &&
              onboarding.completedVia !== "extension"
            }
          />
        </div>
      ) : null}
    </>
  )
}
