import { SettingsPreferences } from "@/components/settings/settings-preferences"
import { SettingsContent } from "@/components/settings/settings-content"
import { BillingSection } from "@/components/settings/billing-section"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import Link from "next/link"
import { requirePageViewer } from "@/server/policies/viewer"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"
import { getUserSettings } from "@/server/services/settings-service"
import { getBillingStatusForUser } from "@/server/services/entitlement-service"
import { CreditCard, Sliders, Puzzle, User } from "lucide-react"

export const dynamic = "force-dynamic"

const navItems = [
  { key: "account", label: "Account", icon: User },
  { key: "app", label: "App", icon: Sliders },
  { key: "integrations", label: "Integrations", icon: Puzzle },
  { key: "billing", label: "Billing", icon: CreditCard },
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
  const section = ["account", "app", "integrations", "billing"].includes(sectionParam)
    ? (sectionParam as "account" | "app" | "integrations" | "billing")
    : "account"

  return (
    <div className="mx-auto max-w-4xl flex gap-8">
      <PageTelemetry
        surface="web-settings"
        area="page"
        event="settings_viewed"
        message="Rendered the settings page."
        context={{ section }}
      />
      <nav className="sticky top-0 w-44 shrink-0 pt-6">
        <div className="flex flex-col gap-1">
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
                  "flex items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-3 py-2 text-[13px] font-medium transition-colors",
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

      <div className="flex flex-1 justify-center pt-6"><div className="w-full max-w-2xl">
        <SettingsContent section={section}>
          {section === "billing" ? (
            <BillingSection billing={billing} checkoutSuccess={checkoutSuccess} />
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
      </div></div>
    </div>
  )
}
