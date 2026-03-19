import { SettingsPreferences } from "@/components/settings/settings-preferences"
import { BillingSection } from "@/components/settings/billing-section"
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

  return (
    <>
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">Settings</h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Configure how Relay works across your chats.
        </p>

        <div className="space-y-4 max-w-2xl pt-6">
          {/* Billing section first */}
          <BillingSection billing={billing} checkoutSuccess={checkoutSuccess} />
        </div>

        <SettingsPreferences
          initialSettings={settings.settings}
          hasConnectedExtension={hasConnectedExtension}
          initialTokens={activeTokens}
        />
      </div>
    </>
  )
}
