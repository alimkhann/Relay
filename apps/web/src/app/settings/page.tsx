import { AppShell } from "@/components/layout/app-shell"
import { ExtensionTokenManager } from "@/components/settings/extension-token-manager"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getUserSettings } from "@/server/services/settings-service"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const viewer = await requireSessionViewer()
  const [settings, tokens] = await Promise.all([getUserSettings(viewer.userId), listExtensionTokensForUser(viewer.userId)])
  const appUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"

  return (
    <AppShell>
      <section className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-[32px] border border-[var(--relay-line)] bg-[#193021] p-7 text-white shadow-[var(--relay-shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/68">Settings</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Keep the browser side simple.</h1>
          <p className="mt-4 text-base leading-8 text-white/82">
            The web app owns sign-in and token issuance. The extension only needs a base URL, a token, and a project choice.
          </p>
          <div className="mt-8 grid gap-3">
            {[
              `Platforms: ${settings.settings.enabledPlatforms.join(", ")}`,
              `Default target: ${settings.settings.defaultTargetProfileKey}`,
              `Auto capture: ${settings.settings.autoCapture ? "on" : "off"}`
            ].map((item) => (
              <div key={item} className="rounded-[20px] bg-white/12 px-4 py-3 text-sm text-white/82">
                {item}
              </div>
            ))}
          </div>
        </div>

        <ExtensionTokenManager initialTokens={tokens} appUrl={appUrl} />
      </section>
    </AppShell>
  )
}
