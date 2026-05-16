"use client"

import type { ReactNode } from "react"
import * as RadixTooltip from "@radix-ui/react-tooltip"

/**
 * Single tooltip provider for the app. Mounted once near the workspace root.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      {children}
    </RadixTooltip.Provider>
  )
}

/**
 * Thin tooltip wrapper styled with Relay tokens.
 *
 * Usage rule (keep it consistent): only wrap (a) icon-only buttons whose
 * action isn't obvious from a label, and (b) destructive / irreversible /
 * system actions. Labeled, non-destructive buttons should NOT get a tooltip.
 */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode
  children: ReactNode
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 select-none rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2 py-1 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)] data-[state=delayed-open]:animate-in"
        >
          {content}
          <RadixTooltip.Arrow className="fill-[var(--relay-ink)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
