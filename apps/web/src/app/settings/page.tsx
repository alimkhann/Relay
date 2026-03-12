import { AppShell } from "@/components/layout/app-shell"
import { SettingsPreferences } from "@/components/settings/settings-preferences"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getUserSettings } from "@/server/services/settings-service"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const viewer = await requireSessionViewer()
  const settings = await getUserSettings(viewer.userId)

  return (
    <AppShell>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1.5 text-sm text-[var(--relay-muted)]">
          Control where Relay works and how it behaves.
        </p>
      </section>

      <SettingsPreferences initialSettings={settings.settings} />
    </AppShell>
  )
}
