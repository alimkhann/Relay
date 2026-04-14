import { SettingsPreferences } from "@/components/settings/settings-preferences"
import { SettingsContent } from "@/components/settings/settings-content"
import { BillingSection } from "@/components/settings/billing-section"
import { ProjectSettingsForm } from "@/components/projects/project-settings-form"
import { FeaturebaseTrigger } from "@/components/feedback/featurebase-trigger"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import Link from "next/link"
import { requirePageViewer } from "@/server/policies/viewer"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"
import { getUserSettings } from "@/server/services/settings-service"
import { getBillingStatusForUser } from "@/server/services/entitlement-service"
import { getProjectSettings } from "@/server/services/project-settings-service"
import { listProjectsForUser } from "@/server/services/project-service"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { CreditCard, Sliders, Puzzle, User, Wrench } from "lucide-react"

export const dynamic = "force-dynamic"

const navItems = [
  { key: "account", label: "Account", icon: User },
  { key: "app", label: "App", icon: Sliders },
  { key: "project", label: "Project", icon: Wrench },
  { key: "integrations", label: "Integrations", icon: Puzzle },
  { key: "billing", label: "Billing & Usage", icon: CreditCard },
] as const

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requirePageViewer("/settings")
  const params = await searchParams
  const [settings, tokens, billing] = await Promise.all([
    getUserSettings(viewer.userId),
    listExtensionTokensForUser(viewer.userId),
    getBillingStatusForUser(viewer.userId),
  ])
  const hasConnectedExtension = tokens.some((token) => !token.revokedAt)
  const activeTokens = tokens.filter((token) => !token.revokedAt)
  const checkoutSuccess = params.checkout === "success"
  const sectionParam = typeof params.section === "string" ? params.section : "account"
  const section = ["account", "app", "project", "integrations", "billing"].includes(sectionParam)
    ? (sectionParam as "account" | "app" | "project" | "integrations" | "billing")
    : "account"

  // Resolve current project for project settings tab
  const projects = await listProjectsForUser(viewer.userId)
  const onboarding = await getResolvedOnboardingStateForUser(viewer.userId, { projects })
  const currentProject = projects.find((p) => p.id === onboarding.completedProjectId) ?? projects[0] ?? null
  const projectSettings = currentProject
    ? await getProjectSettings(viewer.userId, currentProject.id)
    : null

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-8">
      <PageTelemetry
        surface="web-settings"
        area="page"
        event="settings_viewed"
        message="Rendered the settings page."
        context={{ section }}
      />
      <nav className="w-full md:w-44 md:shrink-0 md:sticky md:top-0 pt-2 md:pt-6">
        <div className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 border-b md:border-b-0 border-[var(--relay-line)]">
          {navItems.map((item) => {
            const Icon = item.icon
            const href = item.key === "billing" && checkoutSuccess
              ? `/settings?section=${item.key}&checkout=success`
              : `/settings?section=${item.key}`

            return (
              <Link
                key={item.key}
                href={href}
                className={[
                  "flex shrink-0 whitespace-nowrap items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-3 py-2 text-[13px] font-medium transition-colors",
                  section === item.key
                    ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                    : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="flex-1 max-w-2xl pt-6">
        <SettingsContent section={section}>
          {section === "billing" ? (
            <BillingSection billing={billing} checkoutSuccess={checkoutSuccess} />
          ) : section === "project" && currentProject && projectSettings ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--relay-ink)]">{currentProject.name}</h2>
                <p className="mt-1 text-[13px] text-[var(--relay-muted)]">Configure how Relay manages this project.</p>
              </div>
              <ProjectSettingsForm projectId={currentProject.id} initial={projectSettings} />
            </div>
          ) : section === "project" ? (
            <p className="text-[13px] text-[var(--relay-muted)]">Create a project first to configure project settings.</p>
          ) : (
            <SettingsPreferences
              initialSettings={settings.settings}
              hasConnectedExtension={hasConnectedExtension}
              initialTokens={activeTokens}
              section={section}
              viewer={{ displayName: viewer.name ?? null, email: viewer.email ?? null }}
            />
          )}
        </SettingsContent>

        <div className="mt-10 flex items-center gap-4 border-t border-[var(--relay-line)] pt-6">
          <FeaturebaseTrigger
            kind="feature"
            className="text-[13px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
          >
            Feature requests
          </FeaturebaseTrigger>
          <span className="text-[var(--relay-line)]">|</span>
          <FeaturebaseTrigger
            kind="bug"
            className="text-[13px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
          >
            Report a bug
          </FeaturebaseTrigger>
        </div>
      </div>
    </div>
  )
}
