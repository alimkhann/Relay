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
    startTransition(async () => {
      const response = await relayClientFetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextSettings)
      })

      if (response.ok) {
        setDismissed(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="relative flex w-full items-center justify-center bg-amber-400 px-12 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-medium text-amber-950">
          Auto-capture is off by default.
        </span>
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
          className="rounded-full bg-amber-950 px-3 py-1 text-[12px] font-semibold text-amber-50 transition hover:bg-amber-900 disabled:opacity-60"
        >
          {pending ? "Turning on…" : "Turn on"}
        </button>
      </div>
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
        className="absolute right-4 flex items-center justify-center text-amber-950/60 transition hover:text-amber-950 disabled:opacity-40"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l10 10M12 2L2 12" />
        </svg>
      </button>
    </div>
  )
}
