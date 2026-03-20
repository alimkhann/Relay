"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import type { UserSettingsRow } from "@relay/shared"

import { relayClientFetch } from "@/lib/telemetry/fetch"

interface AutoCaptureOnboardingBannerProps {
  settings: UserSettingsRow["settings"]
}

export function AutoCaptureOnboardingBanner({ settings }: AutoCaptureOnboardingBannerProps) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const shouldShow =
    settings.autoCapturePrompt.eligible &&
    !settings.autoCapturePrompt.dismissedAt &&
    !settings.autoCapturePrompt.activatedAt &&
    !dismissed

  if (!shouldShow) {
    return null
  }

  function updateBanner(nextSettings: UserSettingsRow["settings"]) {
    setError(null)

    startTransition(async () => {
      const response = await relayClientFetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextSettings)
      })

      if (!response.ok) {
        setError("Could not update auto-capture yet.")
        return
      }

      setDismissed(true)
      router.refresh()
    })
  }

  return (
    <div className="mb-6 overflow-hidden rounded-[var(--relay-radius)] border border-amber-300 bg-[linear-gradient(135deg,rgba(255,248,196,0.98),rgba(255,236,153,0.92))] text-amber-950 shadow-[0_14px_40px_rgba(120,53,15,0.08)]">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">Capture stays manual first</p>
          <div>
            <p className="text-[15px] font-semibold text-amber-950">Auto-capture is off by default.</p>
            <p className="text-[13px] leading-relaxed text-amber-900/80">Turn it on when you are ready for Relay to save supported chats automatically.</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              updateBanner({
                ...settings,
                autoCapture: true,
                autoCapturePrompt: {
                  ...settings.autoCapturePrompt,
                  activatedAt: new Date().toISOString()
                }
              })}
            className="rounded-full bg-amber-950 px-4 py-2 text-[13px] font-medium text-amber-50 transition hover:bg-amber-900 disabled:opacity-60"
          >
            {pending ? "Working..." : "Turn on"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              updateBanner({
                ...settings,
                autoCapturePrompt: {
                  ...settings.autoCapturePrompt,
                  dismissedAt: new Date().toISOString()
                }
              })}
            className="rounded-full border border-amber-700/25 bg-amber-50/70 px-4 py-2 text-[13px] font-medium text-amber-900 transition hover:bg-amber-50 disabled:opacity-60"
          >
            Dismiss
          </button>
        </div>
      </div>
      {error ? <p className="border-t border-amber-700/10 px-5 py-2 text-[12px] text-amber-900/75">{error}</p> : null}
    </div>
  )
}
