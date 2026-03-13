import { AppShell } from "@/components/layout/app-shell";
import { SettingsPreferences } from "@/components/settings/settings-preferences";
import { requirePageViewer } from "@/server/policies/viewer";
import { getUserSettings } from "@/server/services/settings-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requirePageViewer("/settings");
  const settings = await getUserSettings(viewer.userId);

  return (
    <AppShell>
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">Settings</h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Configure how Relay works across your chats.
        </p>
        <SettingsPreferences initialSettings={settings.settings} />
      </div>
    </AppShell>
  );
}
