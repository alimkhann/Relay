"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { usePathname } from "next/navigation"

import type { AssistantSurface } from "@relay/shared"

import { logClientEvent } from "@/lib/telemetry/client"

import { AskRelayPanel } from "./ask-relay-panel"

export function AskRelayLauncher({
  plan,
  surface = "dashboard",
  projectId = null,
  initialHidden = false,
}: {
  plan: "free" | "starter" | "pro"
  surface?: AssistantSurface
  projectId?: string | null
  initialHidden?: boolean
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(initialHidden)

  useEffect(() => {
    const handler = (e: Event) => setHidden((e as CustomEvent<boolean>).detail)
    window.addEventListener("relay:ask-relay-panel-changed", handler)
    return () => window.removeEventListener("relay:ask-relay-panel-changed", handler)
  }, [])

  const openPanel = useCallback(() => {
    setOpen(true)
    logClientEvent({
      level: "info",
      area: "assistant",
      event: "assistant.widget_opened",
      message: `Relay agent opened (${surface}, ${plan})`,
      projectId
    })
  }, [surface, plan, projectId])

  // /chat is itself an Ask Relay surface — hiding the floating launcher on
  // that route avoids the redundant widget over the page. Early-returning
  // ABOVE the useCallback above used to violate Rules of Hooks: navigating
  // in or out of /chat changed the hook count between renders, and React
  // bailed with error #300 ("Rendered fewer hooks than expected"), which
  // surfaced as the brief error flash on chat tab switches.
  if (pathname === "/chat" || hidden) return null

  return (
    <>
      <button
        type="button"
        data-relay-surface="assistant"
        onClick={openPanel}
        className="fixed top-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-[var(--relay-line-strong)] bg-[var(--relay-surface-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--relay-ink)] shadow-[var(--relay-shadow)] transition-all hover:bg-[var(--relay-soft)] hover:shadow-[var(--relay-shadow-lg)]"
      >
        <Sparkles className="size-4 text-[var(--relay-accent-blue)]" />
        Relay
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
