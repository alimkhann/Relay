"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { MemoryItemType, ProjectDashboardDto } from "@relay/shared"
import { Pencil, RotateCcw, Trash2 } from "lucide-react"

import { PacketList } from "@/components/context/packet-list"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { createClientFlowId } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

type ContextSection = "decision" | "constraint" | "task"

interface ContextItem {
  key: string
  section: ContextSection
  text: string
  source: "manual" | "derived"
  memoryId?: string
}

const memoryTypeBySection: Record<ContextSection, MemoryItemType> = {
  decision: "decision",
  constraint: "constraint",
  task: "task"
}

const labelBySection: Record<ContextSection, string> = {
  decision: "Decisions",
  constraint: "Constraints",
  task: "Tasks"
}

const hiddenKeyBySection: Record<ContextSection, "hiddenDecisions" | "hiddenConstraints" | "hiddenOpenTasks"> = {
  decision: "hiddenDecisions",
  constraint: "hiddenConstraints",
  task: "hiddenOpenTasks"
}

function buildContextItems(dashboard: ProjectDashboardDto, section: ContextSection): ContextItem[] {
  const hidden = dashboard.stateOverrides?.[hiddenKeyBySection[section]] ?? []
  const hiddenKeys = new Set(hidden.map((item) => item.toLowerCase()))

  const derivedItems = (
    section === "decision"
      ? dashboard.derivedProjectState?.decisions ?? []
      : section === "constraint"
        ? dashboard.derivedProjectState?.constraints ?? []
        : dashboard.derivedProjectState?.openTasks ?? []
  )
    .filter((item) => !hiddenKeys.has(item.toLowerCase()))
    .map((text) => ({
      key: `derived:${section}:${text}`,
      section,
      text,
      source: "derived" as const
    }))

  const manualItems = dashboard.memory
    .filter((item) => item.type === memoryTypeBySection[section])
    .map((item) => ({
      key: `manual:${item.id}`,
      section,
      text: item.content,
      source: "manual" as const,
      memoryId: item.id
    }))

  return [...manualItems, ...derivedItems]
}

export function ProjectGovernancePanel({
  projectId,
  dashboard
}: {
  projectId: string
  dashboard: ProjectDashboardDto
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState("Edit the effective state Relay carries forward, not just the raw digest.")
  const [overview, setOverview] = useState(dashboard.stateOverrides?.projectOverviewOverride ?? dashboard.projectState?.projectOverview ?? "")
  const [objective, setObjective] = useState(dashboard.stateOverrides?.currentObjectiveOverride ?? dashboard.projectState?.currentObjective ?? "")
  const [progress, setProgress] = useState(dashboard.stateOverrides?.recentProgressOverride ?? dashboard.projectState?.recentProgress ?? "")
  const [drafts, setDrafts] = useState<Record<ContextSection, string>>({
    decision: "",
    constraint: "",
    task: ""
  })
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")

  const sections: ContextSection[] = ["decision", "task", "constraint"]

  function runMutation(action: () => Promise<void>, pendingMessage: string, doneMessage: string) {
    startTransition(() => {
      void (async () => {
        setStatus(pendingMessage)
        try {
          await action()
          setStatus(doneMessage)
          router.refresh()
        } catch (cause) {
          setStatus(cause instanceof Error ? cause.message : "Request failed.")
        }
      })()
    })
  }

  function mutateHidden(section: ContextSection, text: string, hidden: boolean) {
    const current = dashboard.stateOverrides?.[hiddenKeyBySection[section]] ?? []
    const next = hidden
      ? Array.from(new Set([...current, text]))
      : current.filter((item) => item.toLowerCase() !== text.toLowerCase())

    runMutation(
      async () => {
        const response = await relayClientFetch(`/api/projects/${projectId}/state`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            [hiddenKeyBySection[section]]: next
          })
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "Context update failed.")
        }
      },
      hidden ? "Removing carry-forward context…" : "Restoring carry-forward context…",
      hidden ? "Carry-forward context updated." : "Carry-forward context restored."
    )
  }

  function saveStateOverrides() {
    runMutation(
      async () => {
        const response = await relayClientFetch(`/api/projects/${projectId}/state`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            projectOverviewOverride: overview.trim() || null,
            currentObjectiveOverride: objective.trim() || null,
            recentProgressOverride: progress.trim() || null
          })
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "State update failed.")
        }
      },
      "Saving effective project state…",
      "Effective project state updated."
    )
  }

  function addManualContext(section: ContextSection) {
    const text = drafts[section].trim()
    if (!text) return

    runMutation(
      async () => {
        const response = await relayClientFetch(`/api/projects/${projectId}/memory`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            type: memoryTypeBySection[section],
            title: null,
            content: text
          })
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "Context item creation failed.")
        }

        setDrafts((current) => ({
          ...current,
          [section]: ""
        }))
      },
      `Saving ${labelBySection[section].toLowerCase()}…`,
      `${labelBySection[section]} updated.`
    )
  }

  function removeItem(item: ContextItem) {
    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const response = await relayClientFetch(`/api/memory/${item.memoryId}`, {
            method: "DELETE"
          })

          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string }
            throw new Error(payload.error ?? "Manual context removal failed.")
          }
        },
        "Removing manual context…",
        "Manual context removed."
      )
      return
    }

    mutateHidden(item.section, item.text, true)
  }

  function startEdit(item: ContextItem) {
    setEditingKey(item.key)
    setEditingText(item.text)
  }

  function saveEdit(item: ContextItem) {
    const nextText = editingText.trim()
    if (!nextText) return

    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const response = await relayClientFetch(`/api/memory/${item.memoryId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              content: nextText
            })
          })

          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string }
            throw new Error(payload.error ?? "Manual context update failed.")
          }

          setEditingKey(null)
        },
        "Updating manual context…",
        "Manual context updated."
      )
      return
    }

    runMutation(
      async () => {
        const createResponse = await relayClientFetch(`/api/projects/${projectId}/memory`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            type: memoryTypeBySection[item.section],
            title: null,
            content: nextText
          })
        })

        if (!createResponse.ok) {
          const payload = (await createResponse.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "Replacement context creation failed.")
        }

        const current = dashboard.stateOverrides?.[hiddenKeyBySection[item.section]] ?? []
        const hideResponse = await relayClientFetch(`/api/projects/${projectId}/state`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            [hiddenKeyBySection[item.section]]: Array.from(new Set([...current, item.text]))
          })
        })

        if (!hideResponse.ok) {
          const payload = (await hideResponse.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "Failed to replace the derived context item.")
        }

        setEditingKey(null)
      },
      "Replacing derived context with a manual override…",
      "Derived context replaced."
    )
  }

  function toggleSessionArchive(sessionId: string, archived: boolean) {
    runMutation(
      async () => {
        const response = await relayClientFetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            archived
          })
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "Session update failed.")
        }
      },
      archived ? "Detaching chat from active project state…" : "Restoring chat to active project state…",
      archived ? "Chat detached and project state rebuilt." : "Chat restored and project state rebuilt."
    )
  }

  function regenerateBriefs() {
    const latestPacket = dashboard.packets[0]
    const targetProfileKey = latestPacket?.targetProfileKey ?? "chatgpt_planning"
    const kind = latestPacket?.kind ?? "fresh_chat_bootstrap"
    const flowId = createClientFlowId("brief")

    runMutation(
      async () => {
        const response = await relayClientFetch(`/api/projects/${projectId}/bootstrap`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          telemetry: {
            surface: "web-dashboard",
            area: "briefs",
            event: "brief_regenerate.submit",
            flowId,
            logSuccess: true
          },
          body: JSON.stringify({
            targetProfileKey,
            kind,
            deep: kind === "fresh_chat_bootstrap"
          })
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string; reason?: string }
          throw new Error(payload.error ?? payload.reason ?? "Brief regeneration failed.")
        }
      },
      "Regenerating project brief…",
      "Project brief regenerated."
    )
  }

  function clearBriefs() {
    if (!confirm("Delete cached project briefs so Relay regenerates them from the current state?")) {
      return
    }

    runMutation(
      async () => {
        const response = await relayClientFetch(`/api/projects/${projectId}/bootstrap`, {
          method: "DELETE"
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "Brief cleanup failed.")
        }
      },
      "Clearing cached project briefs…",
      "Cached project briefs cleared."
    )
  }

  function rebuildState() {
    runMutation(
      async () => {
        const response = await relayClientFetch(`/api/projects/${projectId}/state`, {
          method: "POST"
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? "Project state rebuild failed.")
        }
      },
      "Rebuilding project state from approved history…",
      "Project state rebuilt."
    )
  }

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-faint)]">
              Effective state
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
              Edit what Relay should carry forward
            </h3>
          </div>
          <div className="rounded-full border border-[var(--relay-line)] bg-[var(--relay-soft)] px-3 py-1 text-xs text-[var(--relay-muted)]">
            AI budget {dashboard.aiBudget.dailyProjectAiUsed}/{dashboard.aiBudget.dailyProjectAiLimit} project today
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-faint)]">
              Overview
            </span>
            <textarea
              className="min-h-32 w-full rounded-[18px] border border-[var(--relay-line)] bg-white px-4 py-3 text-sm leading-6 text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
              value={overview}
              onChange={(event) => setOverview(event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-faint)]">
              Current objective
            </span>
            <textarea
              className="min-h-32 w-full rounded-[18px] border border-[var(--relay-line)] bg-white px-4 py-3 text-sm leading-6 text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-faint)]">
              Recent progress
            </span>
            <textarea
              className="min-h-32 w-full rounded-[18px] border border-[var(--relay-line)] bg-white px-4 py-3 text-sm leading-6 text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
              value={progress}
              onChange={(event) => setProgress(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={pending} onClick={saveStateOverrides}>
            Save effective state
          </Button>
          <Button disabled={pending} onClick={rebuildState} variant="secondary">
            Rebuild from history
          </Button>
          <p className="text-sm text-[var(--relay-muted)]">{status}</p>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-faint)]">
                Context governance
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                Decisions, tasks, and constraints
              </h3>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {sections.map((section) => {
              const items = buildContextItems(dashboard, section)

              return (
                <div key={section} className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-faint)]">
                      {labelBySection[section]}
                    </p>
                    <span className="text-xs text-[var(--relay-muted)]">{items.length}</span>
                  </div>

                  <div className="space-y-2">
                    {items.length > 0 ? (
                      items.map((item) => (
                        <div key={item.key} className="rounded-[18px] border border-[var(--relay-line)] bg-white/84 p-3">
                          {editingKey === item.key ? (
                            <div className="space-y-2">
                              <textarea
                                className="min-h-24 w-full rounded-[14px] border border-[var(--relay-line)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--relay-accent)]"
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                              />
                              <div className="flex items-center gap-2">
                                <Button disabled={pending} onClick={() => saveEdit(item)} size="sm">
                                  Save
                                </Button>
                                <Button
                                  disabled={pending}
                                  onClick={() => {
                                    setEditingKey(null)
                                    setEditingText("")
                                  }}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm leading-6 text-[var(--relay-ink-secondary)]">{item.text}</p>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--relay-faint)]">
                                  {item.source === "manual" ? "manual" : "derived"}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    className="rounded-full p-1.5 text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
                                    onClick={() => startEdit(item)}
                                    type="button"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    className="rounded-full p-1.5 text-[var(--relay-muted)] transition hover:bg-rose-50 hover:text-rose-600"
                                    onClick={() => removeItem(item)}
                                    type="button"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-[18px] border border-dashed border-[var(--relay-line)] px-3 py-4 text-sm text-[var(--relay-muted)]">
                        No {labelBySection[section].toLowerCase()} yet.
                      </p>
                    )}
                  </div>

                  <div className="rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-soft)]/65 p-3">
                    <textarea
                      className="min-h-24 w-full rounded-[14px] border border-[var(--relay-line)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--relay-accent)]"
                      placeholder={`Add a ${section} that Relay should keep.`}
                      value={drafts[section]}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [section]: event.target.value
                        }))
                      }
                    />
                    <div className="mt-2 flex justify-end">
                      <Button disabled={pending || !drafts[section].trim()} onClick={() => addManualContext(section)} size="sm">
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-faint)]">
                  Project briefs
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                  Cached insertion packets
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Button disabled={pending} onClick={regenerateBriefs} size="sm">
                  Regenerate
                </Button>
                <Button disabled={pending} onClick={clearBriefs} size="sm" variant="secondary">
                  Clear
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <PacketList packets={dashboard.packets.slice(0, 2)} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-faint)]">
                  Session history
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                  Active and detached chats
                </h3>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {dashboard.sessionHistory.length > 0 ? (
                dashboard.sessionHistory.map((session) => (
                  <div
                    key={session.id}
                    className={`rounded-[18px] border px-4 py-3 ${
                      session.isArchived
                        ? "border-dashed border-[var(--relay-line)] bg-[var(--relay-soft)]/55"
                        : "border-[var(--relay-line)] bg-white/84"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--relay-ink)]">
                          {session.title ?? session.url}
                        </p>
                        <p className="mt-1 text-xs text-[var(--relay-muted)]">
                          {session.platform} · {session.turnCount} turns
                          {session.isArchived && session.archivedAt
                            ? ` · detached ${new Date(session.archivedAt).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        disabled={pending}
                        onClick={() => toggleSessionArchive(session.id, !session.isArchived)}
                        size="sm"
                        variant={session.isArchived ? "secondary" : "ghost"}
                      >
                        {session.isArchived ? (
                          <>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Restore
                          </>
                        ) : (
                          "Detach"
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--relay-muted)]">
                  Supported chats will appear here after capture.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
