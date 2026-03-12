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
      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <div className="rounded-[24px] border border-[var(--relay-line)] bg-[#171915] p-8 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/54">Settings</p>
          <h1 className="mt-4 max-w-md text-5xl font-semibold tracking-[-0.05em]">Keep Relay quiet, trustworthy, and ready for the next fresh chat.</h1>
          <p className="mt-4 max-w-lg text-base leading-8 text-white/76">
            Relay pairs through a short-lived grant, captures supported chats quietly, and falls back gracefully when AI is unavailable.
          </p>

          <div className="mt-8 grid gap-3">
            {[
              "Chrome connection lives here, not in the normal sidepanel flow.",
              "Choose where Relay works and whether it should auto-capture quietly.",
              "If AI is unavailable, Relay still inserts a bounded brief from saved project context."
            ].map((line) => (
              <div key={line} className="rounded-[16px] border border-white/10 bg-white/4 px-4 py-4 text-sm leading-7 text-white/72">
                {line}
              </div>
            ))}
          </div>
        </div>

        <SettingsPreferences initialSettings={settings.settings} />
      </section>
    </AppShell>
  )
}
