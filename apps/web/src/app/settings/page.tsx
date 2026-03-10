import { AppShell } from "@/components/layout/app-shell"
import { Card } from "@/components/ui/card"
import { getUserSettings } from "@/server/services/settings-service"

export default async function SettingsPage() {
  const userId = process.env.RELAY_DEFAULT_USER_ID ?? "demo-user"
  const settings = await getUserSettings(userId)

  return (
    <AppShell>
      <Card className="max-w-3xl p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Settings</p>
        <h1 className="mt-4 font-serif text-4xl tracking-tight">MVP defaults</h1>
        <dl className="mt-8 grid gap-5 text-sm text-stone-700">
          <div className="flex justify-between gap-4 border-b border-stone-900/10 pb-4">
            <dt>Enabled platforms</dt>
            <dd>{settings.settings.enabledPlatforms.join(", ")}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-900/10 pb-4">
            <dt>Default target profile</dt>
            <dd>{settings.settings.defaultTargetProfileKey}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-900/10 pb-4">
            <dt>Automatic capture</dt>
            <dd>{settings.settings.autoCapture ? "Enabled" : "Disabled"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Side panel on supported sites</dt>
            <dd>{settings.settings.showSidepanelOnSupportedSites ? "Enabled" : "Disabled"}</dd>
          </div>
        </dl>
      </Card>
    </AppShell>
  )
}
