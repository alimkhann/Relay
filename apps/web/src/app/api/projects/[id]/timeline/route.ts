import { createRepositoryBundle } from "@relay/db"
import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"

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

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")

  const repos = createRepositoryBundle(viewer.userId)

  // Fetch recent memory items (both active and archived, sorted by created_at desc)
  const recentItems = await repos.memory.listByProject(id)

  // Fetch relations for the project
  const relations = await repos.memory.getRelationsForProject(id)

  const events: TimelineEvent[] = []

  // Add creation events for all items
  for (const item of recentItems) {
    events.push({
      id: `created:${item.id}`,
      eventType: "created",
      timestamp: item.createdAt,
      memoryItem: {
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content.slice(0, 200),
        tags: item.tags,
      },
      metadata: item.metadata,
    })
  }

  // Add relation events
  const itemMap = new Map(recentItems.map((i) => [i.id, i]))
  for (const rel of relations) {
    events.push({
      id: `relation:${rel.id}`,
      eventType: "relation",
      timestamp: rel.createdAt,
      relation: {
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        relationType: rel.relationType,
        confidence: rel.confidence,
      },
      memoryItem: itemMap.get(rel.sourceId)
        ? {
            id: rel.sourceId,
            type: itemMap.get(rel.sourceId)!.type,
            title: itemMap.get(rel.sourceId)!.title,
            content: itemMap.get(rel.sourceId)!.content.slice(0, 200),
            tags: itemMap.get(rel.sourceId)!.tags,
          }
        : undefined,
    })
  }

  // Sort by timestamp descending and limit
  events.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
  const limited = events.slice(0, 30)

  return NextResponse.json({ events: limited })
})
