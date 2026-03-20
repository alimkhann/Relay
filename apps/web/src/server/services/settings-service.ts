import { createRepositoryBundle } from "@relay/db"
import type { UserSettingsRow } from "@relay/shared"

const defaultSettings = {
  enabledPlatforms: ["chatgpt", "perplexity", "claude", "codex"] as ("chatgpt" | "perplexity" | "claude" | "codex")[],
  defaultTargetProfileKey: "claude_code_build",
  autoCapture: true,
  showSidepanelOnSupportedSites: true,
  autoCapturePrompt: {
    eligible: false,
    dismissedAt: null,
    activatedAt: null
  }
}

function buildNewUserSettings(): UserSettingsRow["settings"] {
  return {
    ...defaultSettings,
    autoCapture: false,
    autoCapturePrompt: {
      eligible: true,
      dismissedAt: null,
      activatedAt: null
    }
  }
}

function normalizeSettings(input: Partial<UserSettingsRow["settings"]> | null | undefined): UserSettingsRow["settings"] {
  return {
    enabledPlatforms: input?.enabledPlatforms ?? defaultSettings.enabledPlatforms,
    defaultTargetProfileKey: input?.defaultTargetProfileKey ?? defaultSettings.defaultTargetProfileKey,
    autoCapture: input?.autoCapture ?? defaultSettings.autoCapture,
    showSidepanelOnSupportedSites:
      input?.showSidepanelOnSupportedSites ?? defaultSettings.showSidepanelOnSupportedSites,
    autoCapturePrompt: {
      eligible: input?.autoCapturePrompt?.eligible ?? defaultSettings.autoCapturePrompt.eligible,
      dismissedAt: input?.autoCapturePrompt?.dismissedAt ?? defaultSettings.autoCapturePrompt.dismissedAt,
      activatedAt: input?.autoCapturePrompt?.activatedAt ?? defaultSettings.autoCapturePrompt.activatedAt,
    }
  }
}

export async function getUserSettings(userId: string) {
  const repositories = createRepositoryBundle(userId)
  const existing = await repositories.settings.getByUser(userId)

  if (existing) {
    return {
      ...existing,
      settings: normalizeSettings(existing.settings)
    }
  }

  return {
    userId,
    settings: normalizeSettings(defaultSettings),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export async function updateUserSettings(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const existing = await repositories.settings.getByUser(userId)
  const partial = input as Partial<UserSettingsRow["settings"]>
  const merged = normalizeSettings({
    ...(existing ? normalizeSettings(existing.settings) : defaultSettings),
    ...partial,
    autoCapturePrompt: {
      ...(existing ? normalizeSettings(existing.settings).autoCapturePrompt : defaultSettings.autoCapturePrompt),
      ...partial.autoCapturePrompt
    }
  })

  return repositories.settings.update(userId, merged)
}

export async function initializeUserSettings(userId: string, options?: { newUser?: boolean }) {
  const repositories = createRepositoryBundle(userId)
  const existing = await repositories.settings.getByUser(userId)

  if (existing) {
    const normalized = normalizeSettings(existing.settings)

    if (JSON.stringify(normalized) === JSON.stringify(existing.settings)) {
      return existing
    }

    return repositories.settings.update(userId, normalized)
  }

  return repositories.settings.update(userId, options?.newUser ? buildNewUserSettings() : normalizeSettings(defaultSettings))
}

export { defaultSettings, normalizeSettings }
