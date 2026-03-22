import type { MemoryItemType, MemoryRelationType } from "@relay/shared"

export interface GraphNode {
  id: string
  type: MemoryItemType
  title: string | null
  content: string
  pinned: boolean
  createdAt: string
  tags: string[]
  /** Computed: number of edges connected to this node */
  connectionCount: number
  /** Simulation position */
  x: number
  y: number
  /** Simulation velocity */
  vx: number
  vy: number
  /** Fixed position (when dragged) */
  fx: number | null
  fy: number | null
}

export type GraphEdgeType = MemoryRelationType | "similar"

export interface GraphEdge {
  source: string
  target: string
  type: GraphEdgeType
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** API response shape from /api/projects/:projectId/graph */
export interface GraphApiResponse {
  nodes: Array<{
    id: string
    type: MemoryItemType
    title: string | null
    content: string
    pinned: boolean
    createdAt: string
    tags: string[]
  }>
  edges: Array<{
    source: string
    target: string
    type: GraphEdgeType
    weight: number
  }>
}
