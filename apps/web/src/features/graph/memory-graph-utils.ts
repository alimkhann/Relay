import type {
  MemoryItemType,
  ProjectGraphEdgeKind,
  ProjectGraphNodeKind,
  ProjectGraphSnapshot,
  ProjectSourceKind,
  ProjectSourceStatus,
  SourceSurface,
} from "@relay/shared";
import {
  PERSONAL_CATEGORY_META,
  personalCategoryFromMetadata,
  type PersonalCategory,
} from "@relay/shared/constants/memory-taxonomy";

export const MIN_GRAPH_ITEMS = 1;

export const TYPE_COLORS: Record<MemoryItemType, string> = {
  decision: "#3b82f6",
  task: "#8b5cf6",
  constraint: "#f59e0b",
  note: "#10b981",
  requirement: "#ef4444",
  artifact: "#6366f1",
};

export function nodeColor(node: Pick<GraphNode, "type" | "kind" | "metadata">): string {
  const personalCategory = personalCategoryFromMetadata(node.metadata);
  if (personalCategory) return PERSONAL_CATEGORY_META[personalCategory].color;
  if (node.kind === "entity") return "#14b8a6";
  if (node.kind === "source") return "#6366f1";
  if (node.kind === "conversation") return "#f97316";
  if (node.kind === "observation") return "#a3e635";
  return TYPE_COLORS[node.type];
}

export const TYPE_LABELS: Record<MemoryItemType, string> = {
  decision: "Decisions",
  task: "Tasks",
  constraint: "Constraints",
  note: "Notes",
  requirement: "Requirements",
  artifact: "Artifacts",
};

export const NODE_KIND_LABELS: Record<ProjectGraphNodeKind, string> = {
  memory: "Memory",
  entity: "Entities",
  source: "Sources",
  conversation: "Conversations",
  observation: "Evidence",
};

export const RELATION_COLORS: Record<ProjectGraphEdgeKind, string> = {
  memory_relation: "#3b82f6",
  mentions: "#14b8a6",
  entity_relation: "#22c55e",
  derived_from: "#8b5cf6",
  captured_in: "#f97316",
  supports: "#a3e635",
};

export type GraphRelationType = ProjectGraphEdgeKind;
export type GraphNodeKind = ProjectGraphNodeKind;

export interface GraphNode {
  id: string;
  label: string;
  type: MemoryItemType;
  kind: GraphNodeKind;
  decayScore: number;
  pinned: boolean;
  archived: boolean;
  sourceSurface: SourceSurface | null;
  sourceUrl: string | null;
  content: string;
  title: string | null;
  updatedAt: string;
  capturedAt: string | null;
  lastReaffirmedAt: string | null;
  metadata?: Record<string, unknown>;
  source?: {
    id: string;
    kind: ProjectSourceKind;
    status: ProjectSourceStatus;
    displayName: string;
    originalFileName: string | null;
    mimeType: string | null;
    byteSize: number;
    chunkCount: number;
    tokenEstimate: number;
    previewText: string;
  };
  entity?: {
    id: string;
    name: string;
    kind: string;
    memoryItemIds: string[];
  };
  conversation?: {
    id: string;
    platform: string;
    url: string;
    captureCount: number;
    totalTurns: number;
  };
  observation?: {
    id: string;
    predicate: string | null;
    confidence: number;
  };
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: GraphRelationType;
  label: string;
  confidence: number;
  sourceLink?: boolean;
  entityLink?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  snapshot?: ProjectGraphSnapshot;
}

export interface MemoryGraphSettings {
  showArrows: boolean;
  showLabels: boolean;
  animate: boolean;
  textFadeThreshold: number;
  nodeScale: number;
  linkThickness: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

export const DEFAULT_GRAPH_SETTINGS: MemoryGraphSettings = {
  showArrows: true,
  showLabels: true,
  animate: true,
  textFadeThreshold: 1.55,
  nodeScale: 1.05,
  linkThickness: 1,
  centerForce: 0.45,
  repelForce: 85,
  linkForce: 0.28,
  linkDistance: 58,
};

export interface GraphFilters {
  nodeKinds?: Set<ProjectGraphNodeKind>;
  memoryTypes?: Set<MemoryItemType>;
  personalCategories?: Set<PersonalCategory>;
  edgeKinds?: Set<ProjectGraphEdgeKind>;
}

function fallbackDate(value: string | null | undefined) {
  return value || new Date(0).toISOString();
}

function memoryDecayScore(node: ProjectGraphSnapshot["nodes"][number]) {
  if (node.memory?.pinned) return 1;
  return node.kind === "memory" ? 0.72 : node.kind === "observation" ? 0.62 : 0.82;
}

export function snapshotToGraphData(snapshot: ProjectGraphSnapshot): GraphData {
  const nodes: GraphNode[] = snapshot.nodes.map((node) => {
    const memory = node.memory;
    return {
      id: node.id,
      label: node.label,
      type: memory?.type ?? (node.kind === "source" ? "artifact" : "note"),
      kind: node.kind,
      decayScore: memoryDecayScore(node),
      pinned: memory?.pinned ?? false,
      archived: false,
      sourceSurface: memory?.sourceSurface ?? null,
      sourceUrl: memory?.sourceUrl ?? node.source?.sourceUri ?? node.conversation?.url ?? null,
      content: node.content,
      title: memory?.title ?? node.label,
      updatedAt: fallbackDate(node.updatedAt),
      capturedAt: memory?.capturedAt ?? null,
      lastReaffirmedAt: memory?.lastReaffirmedAt ?? null,
      metadata: node.metadata,
      source: node.source
        ? {
            id: node.source.id,
            kind: node.source.kind,
            status: node.source.status,
            displayName: node.label,
            originalFileName: null,
            mimeType: null,
            byteSize: 0,
            chunkCount: 0,
            tokenEstimate: 0,
            previewText: node.content,
          }
        : undefined,
      entity: node.entity
        ? {
            id: node.entity.id,
            name: node.label,
            kind: node.entity.kind,
            memoryItemIds: [],
          }
        : undefined,
      conversation: node.conversation,
      observation: node.observation,
    };
  });

  return {
    nodes,
    links: snapshot.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      relationType: edge.kind,
      label: edge.label,
      confidence: edge.confidence,
      sourceLink: edge.kind === "derived_from",
      entityLink: edge.kind === "mentions" || edge.kind === "entity_relation",
    })),
    snapshot,
  };
}

export function filterGraphData(data: GraphData, filters: GraphFilters): GraphData {
  const filteredNodes = data.nodes.filter((node) => {
    if (filters.nodeKinds?.size && !filters.nodeKinds.has(node.kind)) return false;
    if (node.kind === "memory" && filters.memoryTypes?.size && !filters.memoryTypes.has(node.type)) return false;
    const personalCategory = personalCategoryFromMetadata(node.metadata);
    if (filters.personalCategories?.size && personalCategory && !filters.personalCategories.has(personalCategory)) {
      return false;
    }
    return true;
  });
  const ids = new Set(filteredNodes.map((node) => node.id));
  return {
    nodes: filteredNodes,
    links: data.links.filter((link) => {
      const source = graphEndpointId(link.source);
      const target = graphEndpointId(link.target);
      if (!ids.has(source) || !ids.has(target)) return false;
      return !filters.edgeKinds?.size || filters.edgeKinds.has(link.relationType);
    }),
    snapshot: data.snapshot,
  };
}

export function nodeRadius(decayScore: number, nodeScale = 1) {
  return Math.max(2.2, Math.min(7.5, (2.2 + decayScore * 4.2) * nodeScale));
}

export function nodeOpacity(decayScore: number) {
  return Math.max(0.55, Math.min(1, 0.55 + decayScore * 0.45));
}

export function labelOpacity(zoom: number, threshold = DEFAULT_GRAPH_SETTINGS.textFadeThreshold) {
  return Math.max(0, Math.min(1, (zoom - threshold) / 0.45));
}

export function graphEndpointId(endpoint: string | GraphNode) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

export function formatMemoryDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
