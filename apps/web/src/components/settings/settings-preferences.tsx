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
  const [status, setStatus] = useState("Relay uses these defaults for auto-capture and target inference.")
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
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Preferences</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Capture and routing defaults</h2>
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
                      setStatus("Platform defaults updated.")
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

      <div className="grid gap-3 md:grid-cols-2">
        <label className="rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-3">
          <span className="text-sm font-medium text-[var(--relay-ink)]">Auto-capture</span>
          <p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">Capture meaningful page changes in the background when Relay is connected.</p>
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
                    setStatus("Auto-capture preference updated.")
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : "Settings update failed.")
                  }
                })
              }}
            />
          </div>
        </label>

        <label className="rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-3">
          <span className="text-sm font-medium text-[var(--relay-ink)]">Quiet sidepanel cues</span>
          <p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">Show Relay’s sidepanel affordance on supported sites without interrupting the normal browsing flow.</p>
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
                    setStatus("Sidepanel preference updated.")
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : "Settings update failed.")
                  }
                })
              }}
            />
          </div>
        </label>
      </div>

      <label className="grid gap-3">
        <span className="text-sm font-medium text-[var(--relay-ink)]">Default target profile</span>
        <select
          className="rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-3 text-[var(--relay-ink)]"
          value={settings.defaultTargetProfileKey}
          onChange={(event) => {
            const nextSettings = {
              ...settings,
              defaultTargetProfileKey: event.target.value
            }

            startTransition(async () => {
              try {
                await save(nextSettings)
                setStatus("Default target profile updated.")
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Settings update failed.")
              }
            })
          }}>
          <option value="chatgpt_planning">ChatGPT planning</option>
          <option value="claude_code_build">Claude build</option>
          <option value="codex_implementation">Codex build</option>
          <option value="perplexity_research">Perplexity research</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>

      <p className="rounded-[16px] bg-[var(--relay-soft)] px-4 py-3 text-sm text-[var(--relay-muted)]">{pending ? "Saving…" : status}</p>
    </div>
  )
}
