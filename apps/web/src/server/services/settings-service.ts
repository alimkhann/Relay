import { createRepositoryBundle } from "@relay/db"
import type { SupportedPlatform, UserSettingsRow } from "@relay/shared"

const defaultSettings = {
  enabledPlatforms: ["chatgpt", "perplexity", "claude", "codex"] as SupportedPlatform[],
  defaultTargetProfileKey: "claude_code_build",
  autoCapture: true,
  showSidepanelOnSupportedSites: true,
  autoCapturePrompt: {
    eligible: false,
    dismissedAt: null,
    activatedAt: null
  },
  sourceImports: {
    autoImportFromExtension: false
  }
}

function buildNewUserSettings(): UserSettingsRow["settings"] {
  return {
    ...defaultSettings,
    enabledPlatforms: ["chatgpt", "perplexity", "claude", "codex", "gemini", "grok", "deepseek"],
    // Auto-capture ON from the first install: the extension only captures on
    // supported AI-chat domains and always shows the visible chip, so there's no
    // silent surveillance — but defaulting OFF behind an orange "turn it on"
    // prompt starved the value moment (users never reached a brief). Every
    // retained user relies on capture; make it work without a toggle.
    autoCapture: true,
    autoCapturePrompt: {
      eligible: false,
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
    },
    sourceImports: {
      autoImportFromExtension:
        input?.sourceImports?.autoImportFromExtension ?? defaultSettings.sourceImports.autoImportFromExtension,
    },
    hideAskRelayDashboard: input?.hideAskRelayDashboard ?? input?.hideAskRelayPanel ?? false,
    hideAskRelayExtension: input?.hideAskRelayExtension ?? false,
    ...(input?.walkthrough !== undefined
      ? { walkthrough: input.walkthrough }
      : {}),
    ...(input?.persona !== undefined ? { persona: input.persona } : {}),
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
  const base = normalizeSettings(existing ? existing.settings : defaultSettings)
  const merged = normalizeSettings({
    ...base,
    ...partial,
    autoCapturePrompt: {
      ...base.autoCapturePrompt,
      ...partial.autoCapturePrompt
    },
    walkthrough: partial.walkthrough !== undefined ? partial.walkthrough : base.walkthrough,
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
