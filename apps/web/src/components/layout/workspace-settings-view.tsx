"use client"

import type { UserSettingsRow } from "@relay/shared"

import { SettingsPreferences } from "@/components/settings/settings-preferences"

export function WorkspaceSettingsView({
  settings,
  hasConnectedExtension
}: {
  settings: UserSettingsRow["settings"]
  hasConnectedExtension: boolean
}) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
        Settings
      </h1>
      <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
        Configure how Relay works across your chats.
      </p>
      <SettingsPreferences
        initialSettings={settings}
        hasConnectedExtension={hasConnectedExtension}
      />
    </div>
  )
}
