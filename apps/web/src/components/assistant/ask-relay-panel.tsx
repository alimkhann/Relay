"use client"

import { useState } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import type { AssistantSurface } from "@relay/shared"

import { cn } from "@/lib/cn"

import { ChatView } from "./chat-view"

export function AskRelayPanel({
  open,
  onOpenChange,
  surface,
  projectId,
  plan
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  surface: AssistantSurface
  projectId: string | null
  plan: "free" | "starter" | "pro"
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-[var(--relay-line)] bg-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)] transition-[max-width] duration-200",
            expanded ? "max-w-full" : "max-w-[440px]",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Relay</DialogPrimitive.Title>
          <ChatView
            surface={surface}
            projectId={projectId}
            plan={plan}
            variant="panel"
            expanded={expanded}
            onToggleExpand={() => setExpanded((v) => !v)}
            onClose={() => onOpenChange(false)}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
