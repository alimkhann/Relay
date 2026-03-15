import { AppShell } from "@/components/layout/app-shell";
import { SettingsPreferences } from "@/components/settings/settings-preferences";
import { requirePageViewer, syncViewerProfile } from "@/server/policies/viewer";
import { listExtensionTokensForUser } from "@/server/services/extension-token-service";
import { listProjectsForUser } from "@/server/services/project-service";
import { getUserSettings } from "@/server/services/settings-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requirePageViewer("/settings");
  await syncViewerProfile(viewer);
  const [settings, tokens, projects] = await Promise.all([
    getUserSettings(viewer.userId),
    listExtensionTokensForUser(viewer.userId),
    listProjectsForUser(viewer.userId),
  ]);
  const hasConnectedExtension = tokens.some((token) => !token.revokedAt);

  return (
    <AppShell
      account={{
        name: viewer.name,
        email: viewer.email,
      }}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      currentProjectId={projects[0]?.id}
      workspaceSnapshot={{
        kind: "settings",
        cacheKey: "settings",
        href: "/settings",
        settings: settings.settings,
        hasConnectedExtension,
      }}
    >
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
    </AppShell>
  );
}
