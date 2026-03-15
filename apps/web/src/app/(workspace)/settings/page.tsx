import { WorkspaceSnapshotSeed } from "@/components/layout/workspace-snapshot-seed"
import { SettingsPreferences } from "@/components/settings/settings-preferences"
import { requirePageViewer } from "@/server/policies/viewer"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"
import { getUserSettings } from "@/server/services/settings-service"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const viewer = await requirePageViewer("/settings")
  const [settings, tokens] = await Promise.all([
    getUserSettings(viewer.userId),
    listExtensionTokensForUser(viewer.userId),
  ])
  const hasConnectedExtension = tokens.some((token) => !token.revokedAt)

  return (
    <>
      <WorkspaceSnapshotSeed
        snapshot={{
          kind: "settings",
          cacheKey: "settings",
          href: "/settings",
          settings: settings.settings,
          hasConnectedExtension,
        }}
      />
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">Settings</h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Configure how Relay works across your chats.
        </p>
        <SettingsPreferences
          initialSettings={settings.settings}
          hasConnectedExtension={hasConnectedExtension}
        />
      </div>
    </>
  )
}
