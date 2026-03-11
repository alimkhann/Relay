import { createRepositoryBundle } from "@relay/db"

const defaultSettings = {
  enabledPlatforms: ["chatgpt", "perplexity", "claude", "codex"] as ("chatgpt" | "perplexity" | "claude" | "codex")[],
  defaultTargetProfileKey: "claude_code_build",
  autoCapture: true,
  showSidepanelOnSupportedSites: true
}

export async function getUserSettings(userId: string) {
  const repositories = createRepositoryBundle(userId)
  return (await repositories.settings.getByUser(userId)) ?? {
    userId,
    settings: defaultSettings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export async function updateUserSettings(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const partial = input as Partial<typeof defaultSettings>

  return repositories.settings.update(userId, {
    enabledPlatforms: (partial.enabledPlatforms as typeof defaultSettings.enabledPlatforms | undefined) ?? defaultSettings.enabledPlatforms,
    defaultTargetProfileKey: partial.defaultTargetProfileKey ?? defaultSettings.defaultTargetProfileKey,
    autoCapture: partial.autoCapture ?? defaultSettings.autoCapture,
    showSidepanelOnSupportedSites: partial.showSidepanelOnSupportedSites ?? defaultSettings.showSidepanelOnSupportedSites
  })
}
