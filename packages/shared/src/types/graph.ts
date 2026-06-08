import type { MemoryItemType, SourceSurface, SupportedPlatform } from "./database"
import type { ProjectSourceKind, ProjectSourceStatus } from "./source"

export type ProjectGraphDensity = "compact" | "full"

export type ProjectGraphNodeKind =
  | "memory"
  | "entity"
  | "source"
  | "conversation"
  | "observation"

export type ProjectGraphEdgeKind =
  | "memory_relation"
  | "mentions"
  | "entity_relation"
  | "derived_from"
  | "captured_in"
  | "supports"

export interface ProjectGraphNode {
  id: string
  kind: ProjectGraphNodeKind
  label: string
  content: string
  updatedAt: string
  metadata: Record<string, unknown>
  memory?: {
    id: string
    type: MemoryItemType
    title: string | null
    pinned: boolean
    sourceSurface: SourceSurface | null
    sourceUrl: string | null
    capturedAt: string | null
    lastReaffirmedAt: string | null
  }
  entity?: {
    id: string
    kind: string
  }
  source?: {
    id: string
    kind: ProjectSourceKind
    status: ProjectSourceStatus
    sourceUri: string | null
  }
  conversation?: {
    id: string
    platform: SupportedPlatform
    url: string
    captureCount: number
    totalTurns: number
  }
  observation?: {
    id: string
    predicate: string | null
    confidence: number
  }
}

export interface ProjectGraphEdge {
  id: string
  source: string
  target: string
  kind: ProjectGraphEdgeKind
  label: string
  confidence: number
}

export interface ProjectGraphSnapshot {
  projectId: string
  density: ProjectGraphDensity
  includeEvidence: boolean
  nodes: ProjectGraphNode[]
  edges: ProjectGraphEdge[]
  stats: {
    nodeCount: number
    edgeCount: number
    isolatedNodeCount: number
    truncated: boolean
  }
}
