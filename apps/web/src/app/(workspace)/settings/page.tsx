import { SettingsPreferences } from "@/components/settings/settings-preferences"
import { BillingSection } from "@/components/settings/billing-section"
import Link from "next/link"
import { requirePageViewer } from "@/server/policies/viewer"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"
import { getUserSettings } from "@/server/services/settings-service"
import { getBillingStatusForUser } from "@/server/services/entitlement-service"

export const dynamic = "force-dynamic"

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
  const sectionParam = typeof params.section === "string" ? params.section : "billing"
  const section = ["billing", "app", "integrations", "account"].includes(sectionParam)
    ? (sectionParam as "billing" | "app" | "integrations" | "account")
    : "billing"

  const navItems = [
    { key: "billing", label: "Billing" },
    { key: "app", label: "App" },
    { key: "integrations", label: "Integrations" },
    { key: "account", label: "Account" },
  ] as const

  return (
    <div className="max-w-3xl">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">Settings</h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Configure how Relay works across your chats.
        </p>

        <div className="flex flex-wrap gap-2 pt-6">
          {navItems.map((item) => {
            const href = item.key === "billing" && checkoutSuccess
              ? `/settings?section=${item.key}&checkout=success`
              : `/settings?section=${item.key}`

            return (
              <Link
                key={item.key}
                href={href}
                className={[
                  "rounded-[var(--relay-radius-sm)] border px-4 py-2 text-[13px] font-medium transition-colors",
                  section === item.key
                    ? "border-[var(--relay-accent)] bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                    : "border-[var(--relay-line)] text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
                ].join(" ")}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="space-y-4 pt-6">
          {section === "billing" ? (
            <BillingSection billing={billing} checkoutSuccess={checkoutSuccess} />
          ) : (
            <SettingsPreferences
              initialSettings={settings.settings}
              hasConnectedExtension={hasConnectedExtension}
              initialTokens={activeTokens}
              section={section}
            />
          )}
        </div>
      </div>
  )
}
