import { createRepositoryBundle } from "@relay/db"
import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")

  const repos = createRepositoryBundle(viewer.userId)

  const [items, relations, similarityEdges] = await Promise.all([
    repos.memory.listByProject(id),
    repos.memory.getRelationsForProject(id),
    repos.memory.getSimilarityEdgesForProject(id, 0.75),
  ])

  const nodes = items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    pinned: item.pinned,
    createdAt: item.createdAt,
    tags: item.tags,
  }))

  const explicitEdgeKeys = new Set<string>()

  const edges: Array<{
    source: string
    target: string
    type: "supersedes" | "extends" | "derives" | "similar"
    weight: number
  }> = []

  for (const rel of relations) {
    const key = [rel.sourceId, rel.targetId].sort().join(":")
    explicitEdgeKeys.add(key)
    edges.push({
      source: rel.sourceId,
      target: rel.targetId,
      type: rel.relationType as "supersedes" | "extends" | "derives",
      weight: rel.confidence,
    })
  }

  for (const sim of similarityEdges) {
    const key = [sim.sourceId, sim.targetId].sort().join(":")
    if (!explicitEdgeKeys.has(key)) {
      edges.push({
        source: sim.sourceId,
        target: sim.targetId,
        type: "similar",
        weight: sim.similarity,
      })
    }
  }

  return NextResponse.json({ nodes, edges })
})
