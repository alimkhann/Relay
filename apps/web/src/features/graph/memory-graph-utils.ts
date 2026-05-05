import type { MemoryItemDto, MemoryItemType, SourceSurface } from "@relay/shared";

export const MIN_GRAPH_ITEMS = 8;

export const TYPE_COLORS: Record<MemoryItemType, string> = {
  decision: "#3b82f6",
  task: "#8b5cf6",
  constraint: "#f59e0b",
  note: "#10b981",
  requirement: "#ef4444",
  artifact: "#6366f1",
};

export const TYPE_LABELS: Record<MemoryItemType, string> = {
  decision: "Decisions",
  task: "Tasks",
  constraint: "Constraints",
  note: "Notes",
  requirement: "Requirements",
  artifact: "Artifacts",
};

export const RELATION_COLORS = {
  supersedes: "#ef4444",
  extends: "#3b82f6",
  derives: "#8b5cf6",
  similar: "#71717a",
} as const;

export type GraphRelationType = keyof typeof RELATION_COLORS;

export interface GraphNode {
  id: string;
  label: string;
  type: MemoryItemType;
  decayScore: number;
  pinned: boolean;
  sourceSurface: SourceSurface | null;
  sourceUrl: string | null;
  content: string;
  title: string | null;
  updatedAt: string;
  capturedAt: string | null;
  lastReaffirmedAt: string | null;
  metadata?: Record<string, unknown>;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: GraphRelationType;
  confidence: number;
  fallback?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface MemoryGraphSettings {
  showArrows: boolean;
  showLabels: boolean;
  showFallbackLinks: boolean;
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
  showFallbackLinks: true,
  animate: true,
  textFadeThreshold: 1.55,
  nodeScale: 1.05,
  linkThickness: 1,
  centerForce: 0.9,
  repelForce: 38,
  linkForce: 0.58,
  linkDistance: 46,
};

export interface RelationDto {
  sourceId: string;
  targetId: string;
  relationType: "supersedes" | "extends" | "derives";
  confidence: number;
}

export interface SimilarityEdgeDto {
  sourceId: string;
  targetId: string;
  similarity: number;
}

export interface RelationsResponse {
  relations: RelationDto[];
  similarityEdges: SimilarityEdgeDto[];
}

function truncateLabel(value: string, maxLength = 44) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

export function buildGraphNodes(items: MemoryItemDto[]): GraphNode[] {
  return items.map((item) => ({
    id: item.id,
    label: truncateLabel(item.title ?? item.content),
    type: item.type,
    decayScore: Number.isFinite(item.decayScore) ? item.decayScore : 0.5,
    pinned: item.pinned,
    sourceSurface: item.sourceSurface,
    sourceUrl: item.sourceUrl,
    content: item.content,
    title: item.title,
    updatedAt: item.updatedAt,
    capturedAt: item.capturedAt,
    lastReaffirmedAt: item.lastReaffirmedAt,
    metadata: item.metadata,
  }));
}

function endpointId(endpoint: string | GraphNode) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function linkKey(sourceId: string, targetId: string, relationType: string) {
  return `${sourceId}:${targetId}:${relationType}`;
}

export function buildGraphLinks(
  nodes: GraphNode[],
  relations: RelationDto[],
  similarityEdges: SimilarityEdgeDto[],
): GraphLink[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links: GraphLink[] = [];
  const linkedNodeIds = new Set<string>();
  const seen = new Set<string>();

  for (const relation of relations) {
    if (!nodeIds.has(relation.sourceId) || !nodeIds.has(relation.targetId)) {
      continue;
    }

    const key = linkKey(relation.sourceId, relation.targetId, relation.relationType);
    if (seen.has(key)) continue;

    links.push({
      source: relation.sourceId,
      target: relation.targetId,
      relationType: relation.relationType,
      confidence: relation.confidence,
    });
    seen.add(key);
    linkedNodeIds.add(relation.sourceId);
    linkedNodeIds.add(relation.targetId);
  }

  for (const edge of similarityEdges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      continue;
    }

    const key = linkKey(edge.sourceId, edge.targetId, "similar");
    if (seen.has(key)) continue;

    links.push({
      source: edge.sourceId,
      target: edge.targetId,
      relationType: "similar",
      confidence: edge.similarity,
    });
    seen.add(key);
    linkedNodeIds.add(edge.sourceId);
    linkedNodeIds.add(edge.targetId);
  }

  const orphansByType = new Map<MemoryItemType, GraphNode[]>();
  for (const node of nodes) {
    if (linkedNodeIds.has(node.id)) continue;
    const group = orphansByType.get(node.type) ?? [];
    group.push(node);
    orphansByType.set(node.type, group);
  }

  for (const group of orphansByType.values()) {
    for (let index = 0; index < group.length - 1; index += 1) {
      const source = group[index]!;
      const target = group[index + 1]!;
      const key = linkKey(source.id, target.id, "similar");
      if (seen.has(key)) continue;
      links.push({
        source: source.id,
        target: target.id,
        relationType: "similar",
        confidence: 0.35,
        fallback: true,
      });
      seen.add(key);
    }
  }

  return links;
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
  return endpointId(endpoint);
}

export function formatMemoryDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
