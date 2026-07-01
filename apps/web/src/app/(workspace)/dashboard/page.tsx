import { redirect } from "next/navigation"

import { createRepositoryBundle } from "@relay/db"

import { ReferralWelcomeBanner } from "@/components/referral/referral-welcome-banner"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { DashboardContent } from "@/features/projects/dashboard-content"
import { logServerEvent } from "@/server/logging/logger"
import { requirePageViewer } from "@/server/policies/viewer"
import { getDefaultEntitlements } from "@/server/services/billing-config"
import {
  completeOnboardingForUser,
  getResolvedOnboardingStateForUser
} from "@/server/services/onboarding-service"
import { ensurePersonalProjectForUser, listProjectsForUser } from "@/server/services/project-service"
import { resolveViewerEntitlements } from "@/server/services/entitlement-service"
import { defaultSettings, getUserSettings, normalizeSettings } from "@/server/services/settings-service"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; projectName?: string; projectDescription?: string; projectUrl?: string; walkthrough?: string }>
}) {
  const viewer = await requirePageViewer("/dashboard")
  // Include personal so it can be selected from the switcher, but keep the
  // regular-only list for onboarding/empty-state/default resolution (personal
  // is never the implicit current project and must not count as "has projects").
  let allProjects = await listProjectsForUser(viewer.userId, { includePersonal: true })
  const projects = allProjects.filter((p) => p.kind !== "personal")
  let personalProject = allProjects.find((p) => p.kind === "personal") ?? null
  const [resolvedOnboarding, settings] = await Promise.all([
    getResolvedOnboardingStateForUser(viewer.userId, { projects }).catch((error) => {
      void logServerEvent({
        level: "warn",
        surface: "web-dashboard",
        area: "onboarding",
        event: "dashboard.onboarding_fallback",
        message: "Dashboard rendered with derived onboarding state after lookup failed.",
        userId: viewer.userId,
        context: { reason: error instanceof Error ? error.message : "unknown" }
      })
      return projects.length > 0
        ? {
            status: "completed" as const,
            completedProjectId: projects[0]?.id ?? null,
            completedVia: null,
            completedAt: null
          }
        : {
            status: "pending" as const,
            completedProjectId: null,
            completedVia: null,
            completedAt: null
          }
    }),
    getUserSettings(viewer.userId).catch((error) => {
      void logServerEvent({
        level: "warn",
        surface: "web-dashboard",
        area: "settings",
        event: "dashboard.settings_fallback",
        message: "Dashboard rendered with default settings after settings lookup failed.",
        userId: viewer.userId,
        context: { reason: error instanceof Error ? error.message : "unknown" }
      })
      return {
        userId: viewer.userId,
        settings: normalizeSettings(defaultSettings),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }),
  ])
  let onboarding = resolvedOnboarding

  if (onboarding.status === "pending" && !personalProject) {
    const ensuredPersonal = await ensurePersonalProjectForUser(viewer.userId).catch((error) => {
      void logServerEvent({
        level: "warn",
        surface: "web-dashboard",
        area: "onboarding",
        event: "dashboard.personal_project_repair_failed",
        message: "Dashboard could not ensure a personal project for pending onboarding.",
        userId: viewer.userId,
        context: { reason: error instanceof Error ? error.message : "unknown" }
      })
      return null
    })

    if (ensuredPersonal) {
      personalProject = {
        id: ensuredPersonal.id,
        name: ensuredPersonal.name,
        slug: ensuredPersonal.slug,
        description: ensuredPersonal.description,
        projectUrl: ensuredPersonal.projectUrl,
        memoryCount: 0,
        sessionCount: 0,
        routingContext: {
          hasMeaningfulContext: false,
          keywords: [],
        },
        updatedAt: ensuredPersonal.updatedAt,
        kind: ensuredPersonal.kind,
      }
      allProjects = [...allProjects, personalProject]
    }
  }

  if (onboarding.status === "pending" && personalProject) {
    onboarding = await completeOnboardingForUser(viewer.userId, personalProject.id, "web", {
      onboardingStep: "personal_project_selected",
    }).catch((error) => {
      void logServerEvent({
        level: "warn",
        surface: "web-dashboard",
        area: "onboarding",
        event: "dashboard.personal_onboarding_fallback",
        message: "Dashboard rendered with personal project after onboarding completion failed.",
        userId: viewer.userId,
        projectId: personalProject.id,
        context: { reason: error instanceof Error ? error.message : "unknown" }
      })
      return {
        status: "completed" as const,
        completedProjectId: personalProject.id,
        completedVia: "web" as const,
        completedAt: new Date().toISOString()
      }
    })
  }

  const repositories = createRepositoryBundle(viewer.userId)
  const refereeReferral = await repositories.referrals.getByRefereeId(viewer.userId).catch(() => null)
  const wasReferred = Boolean(refereeReferral)

  if (onboarding.status === "pending") {
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

    redirect("/get-started")
  }

  const { project: selectedProjectId, walkthrough: walkthroughParam } = await searchParams
  const currentProject =
    (selectedProjectId
      ? allProjects.find((p) => p.id === selectedProjectId)
      : projects.find((p) => p.id === onboarding.completedProjectId)) ??
    projects[0] ??
    (onboarding.completedProjectId
      ? allProjects.find((p) => p.id === onboarding.completedProjectId)
      : null) ??
    personalProject ??
    null

  // Canonicalize URL so sidebar and dashboard always agree on project
  if (!selectedProjectId && currentProject) {
    redirect(`/dashboard?project=${currentProject.id}`)
  }

  const entitlements = await resolveViewerEntitlements(viewer.userId).catch((error) => {
    void logServerEvent({
      level: "warn",
      surface: "web-dashboard",
      area: "billing",
      event: "dashboard.entitlements_fallback",
      message: "Dashboard rendered with free entitlements after entitlement lookup failed.",
      userId: viewer.userId,
      context: { reason: error instanceof Error ? error.message : "unknown" }
    })
    return getDefaultEntitlements()
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
          hasProject: Boolean(currentProject),
          onboardingStatus: onboarding.status,
          projectId: currentProject?.id ?? null,
        }}
      />
      {currentProject ? (
        <div className="pt-6">
          {wasReferred && !entitlements.isPaid ? <ReferralWelcomeBanner /> : null}
          <DashboardContent
            key={currentProject.id}
            project={{
              id: currentProject.id,
              name: currentProject.name,
              description: currentProject.description,
              projectUrl: currentProject.projectUrl,
              kind: currentProject.kind,
            }}
            walkthroughInitiallyOpen={
              walkthroughParam === "extension" ||
              (!settings.settings.walkthrough?.dismissedAt &&
              onboarding.completedVia !== "extension")
            }
            walkthroughInitialStep={walkthroughParam === "extension" ? "extension" : 0}
          />
        </div>
      ) : null}
    </>
  )
}
