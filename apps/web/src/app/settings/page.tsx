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
          <h1 className="mt-4 max-w-md text-5xl font-semibold tracking-[-0.05em]">Keep the browser flow private, quiet, and recoverable.</h1>
          <p className="mt-4 max-w-lg text-base leading-8 text-white/76">
            Relay now pairs the extension through a short-lived grant instead of exposing a device token in the normal setup flow. Open the sidepanel in Chrome and choose Connect Relay there.
          </p>

          <div className="mt-8 grid gap-3">
            {[
              "Gemini 3.x handles digest and deep bootstrap work first.",
              "Gemini 2.5 is reserved for automatic fallback when 3.x rate limits hit.",
              "If both AI lanes are unavailable, Relay degrades to a bounded deterministic packet."
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
