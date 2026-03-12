"use client"

import { useState, useTransition } from "react"

import type { UserSettingsRow } from "@relay/shared"

import { Button } from "@/components/ui/button"

interface SettingsPreferencesProps {
  initialSettings: UserSettingsRow["settings"]
}

const platformOptions = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "codex", label: "Codex" },
  { key: "perplexity", label: "Perplexity" }
] as const

export function SettingsPreferences({ initialSettings }: SettingsPreferencesProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [status, setStatus] = useState("Relay uses these settings to decide where it works and how quietly it should help.")
  const [pending, startTransition] = useTransition()

  async function save(nextSettings: typeof settings) {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(nextSettings)
    })

    if (!response.ok) {
      throw new Error("Settings update failed.")
    }

    setSettings(nextSettings)
  }

  return (
    <div className="space-y-6 rounded-[24px] border border-[var(--relay-line)] bg-white/82 p-6 shadow-[var(--relay-shadow)]">
      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Chrome connection</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Connect Relay in Chrome</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
            Open the extension sidepanel in Chrome and choose <span className="font-semibold text-[var(--relay-ink)]">Connect Relay</span>. The normal flow does not expose raw device tokens.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Where Relay works</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Choose the chats Relay should watch</h2>
        </div>

        <div className="grid gap-3">
          {platformOptions.map((platform) => {
            const checked = settings.enabledPlatforms.includes(platform.key)
            return (
              <label key={platform.key} className="flex items-center justify-between rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-3">
                <span className="text-sm font-medium text-[var(--relay-ink)]">{platform.label}</span>
                <input
                  checked={checked}
                  type="checkbox"
                  onChange={(event) => {
                    const enabledPlatforms = event.target.checked
                      ? [...settings.enabledPlatforms, platform.key]
                      : settings.enabledPlatforms.filter((item) => item !== platform.key)

                    const nextSettings = {
                      ...settings,
                      enabledPlatforms
                    }

                    startTransition(async () => {
                      try {
                        await save(nextSettings)
                        setStatus("Where Relay works has been updated.")
                      } catch (error) {
                        setStatus(error instanceof Error ? error.message : "Settings update failed.")
                      }
                    })
                  }}
                />
              </label>
            )
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Capture behavior</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Keep Relay quiet unless it is useful</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--relay-ink)]">Auto-capture</span>
            <p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">Capture meaningful page changes in the background.</p>
            <div className="mt-4">
              <input
                checked={settings.autoCapture}
                type="checkbox"
                onChange={(event) => {
                  const nextSettings = {
                    ...settings,
                    autoCapture: event.target.checked
                  }

                  startTransition(async () => {
                    try {
                      await save(nextSettings)
                      setStatus("Auto-capture updated.")
                    } catch (error) {
                      setStatus(error instanceof Error ? error.message : "Settings update failed.")
                    }
                  })
                }}
              />
            </div>
          </label>

          <label className="rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--relay-ink)]">Quiet cues</span>
            <p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">Show inline help on supported fresh chats without interrupting your normal flow.</p>
            <div className="mt-4">
              <input
                checked={settings.showSidepanelOnSupportedSites}
                type="checkbox"
                onChange={(event) => {
                  const nextSettings = {
                    ...settings,
                    showSidepanelOnSupportedSites: event.target.checked
                  }

                  startTransition(async () => {
                    try {
                      await save(nextSettings)
                      setStatus("Quiet cues updated.")
                    } catch (error) {
                      setStatus(error instanceof Error ? error.message : "Settings update failed.")
                    }
                  })
                }}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Fallback behavior</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Relay should still help when AI is unavailable</h2>
        </div>

        <div className="rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-4 text-sm leading-7 text-[var(--relay-muted)]">
          AI-generated briefs stay on when available. If Relay cannot reach AI, it still inserts a bounded project brief from saved project context.
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>

      <p className="rounded-[16px] bg-[var(--relay-soft)] px-4 py-3 text-sm text-[var(--relay-muted)]">{pending ? "Saving…" : status}</p>
    </div>
  )
}
