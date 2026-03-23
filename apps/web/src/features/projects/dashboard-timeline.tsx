"use client"

import { useEffect, useState } from "react"
import { GitBranch, Plus, Archive } from "lucide-react"

import { cn } from "@/lib/cn"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface TimelineEvent {
  id: string
  eventType: "created" | "archived" | "relation"
  timestamp: string
  memoryItem?: {
    id: string
    type: string
    title: string | null
    content: string
    tags: string[]
  }
  relation?: {
    sourceId: string
    targetId: string
    relationType: string
    confidence: number
  }
  metadata?: Record<string, unknown>
}

const TYPE_COLORS: Record<string, string> = {
  decision: "bg-amber-500",
  constraint: "bg-red-500",
  task: "bg-blue-500",
  note: "bg-gray-400",
  requirement: "bg-purple-500",
  artifact: "bg-emerald-500",
}

function formatTimeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function EventIcon({ eventType }: { eventType: string }) {
  switch (eventType) {
    case "created":
      return <Plus className="h-3 w-3" />
    case "archived":
      return <Archive className="h-3 w-3" />
    case "relation":
      return <GitBranch className="h-3 w-3" />
    default:
      return <Plus className="h-3 w-3" />
  }
}

export function DashboardTimeline({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchTimeline() {
      try {
        const res = await relayClientFetch(`/api/projects/${projectId}/timeline`)
        if (!res.ok) return
        const data = (await res.json()) as { events: TimelineEvent[] }
        if (!cancelled) setEvents(data.events)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchTimeline()
    return () => { cancelled = true }
  }, [projectId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-[var(--relay-muted)] animate-pulse">Loading timeline...</span>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-[var(--relay-muted)]">No memory activity yet.</span>
      </div>
    )
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-[var(--relay-line)]" />

      <div className="space-y-4">
        {events.map((event) => (
          <div key={event.id} className="relative flex items-start gap-3">
            {/* Dot on the timeline */}
            <div className={cn(
              "absolute -left-6 mt-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--relay-bg)]",
              event.eventType === "created" ? "bg-[var(--relay-accent)] text-white" :
              event.eventType === "relation" ? "bg-[var(--relay-soft)] text-[var(--relay-muted)]" :
              "bg-[var(--relay-warning)]/20 text-[var(--relay-warning)]"
            )}>
              <EventIcon eventType={event.eventType} />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-3">
              <div className="flex items-center gap-2 mb-1">
                {event.memoryItem && (
                  <>
                    <span className={cn("h-2 w-2 rounded-full", TYPE_COLORS[event.memoryItem.type] ?? "bg-gray-400")} />
                    <span className="text-[11px] font-medium text-[var(--relay-muted)] uppercase tracking-wider">
                      {event.memoryItem.type}
                    </span>
                  </>
                )}
                {event.eventType === "relation" && event.relation && (
                  <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                    {event.relation.relationType} ({(event.relation.confidence * 100).toFixed(0)}%)
                  </span>
                )}
                <span className="ml-auto text-[10px] text-[var(--relay-faint)]">
                  {formatTimeAgo(event.timestamp)}
                </span>
              </div>

              {event.memoryItem && (
                <>
                  {event.memoryItem.title && (
                    <p className="text-[13px] font-medium text-[var(--relay-ink)] leading-snug mb-0.5">
                      {event.memoryItem.title}
                    </p>
                  )}
                  <p className="text-[12px] text-[var(--relay-muted)] leading-relaxed line-clamp-2">
                    {event.memoryItem.content}
                  </p>
                  {event.memoryItem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {event.memoryItem.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-block rounded-full bg-[var(--relay-soft)] px-1.5 py-0.5 text-[9px] text-[var(--relay-faint)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}

              {event.metadata?.source === "digest" && (
                <span className="inline-block mt-1 text-[9px] text-[var(--relay-faint)]">
                  from AI digest
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
