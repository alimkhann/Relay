"use client"

import { useCallback, useState } from "react"
import { Sparkles } from "lucide-react"

import type { AssistantSurface } from "@relay/shared"

import { logClientEvent } from "@/lib/telemetry/client"

import { AskRelayPanel } from "./ask-relay-panel"

export function AskRelayLauncher({
  plan,
  surface = "dashboard",
  projectId = null
}: {
  plan: "free" | "starter" | "pro"
  surface?: AssistantSurface
  projectId?: string | null
}) {
  const [open, setOpen] = useState(false)

  const openPanel = useCallback(() => {
    setOpen(true)
    logClientEvent({
      level: "info",
      area: "assistant",
      event: "assistant.widget_opened",
      message: `Ask Relay opened (${surface}, ${plan})`,
      projectId
    })
  }, [surface, plan, projectId])

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="fixed top-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-[var(--relay-line-strong)] bg-[var(--relay-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--relay-ink)] shadow-[var(--relay-shadow)] transition-all hover:shadow-[var(--relay-shadow-lg)]"
      >
        <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
        Ask Relay
      </button>
      <AskRelayPanel
        open={open}
        onOpenChange={setOpen}
        surface={surface}
        projectId={projectId}
        plan={plan}
      />
    </>
  )
}
