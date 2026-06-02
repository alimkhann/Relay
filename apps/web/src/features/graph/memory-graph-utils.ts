import type { MemoryItemDto, MemoryItemType, ProjectSourceKind, ProjectSourceStatus, SourceSurface } from "@relay/shared";
import { PERSONAL_CATEGORY_META, personalCategoryFromMetadata } from "@relay/shared";

export const MIN_GRAPH_ITEMS = 8;

export const TYPE_COLORS: Record<MemoryItemType, string> = {
  decision: "#3b82f6",
  task: "#8b5cf6",
  constraint: "#f59e0b",
  note: "#10b981",
  requirement: "#ef4444",
  artifact: "#6366f1",
};

/**
 * Node fill color. Personal-memory nodes (metadata.personalCategory set) use the
 * Folk category palette; everything else uses the project TYPE_COLORS.
 */
export function nodeColor(node: Pick<GraphNode, "type" | "metadata">): string {
  const personalCategory = personalCategoryFromMetadata(node.metadata);
  if (personalCategory) return PERSONAL_CATEGORY_META[personalCategory].color;
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

export const RELATION_COLORS = {
  supersedes: "#ef4444",
  extends: "#3b82f6",
  derives: "#8b5cf6",
  mentions: "#14b8a6",
  similar: "#71717a",
} as const;

export type GraphRelationType = keyof typeof RELATION_COLORS;

export type HubRole = "root" | "type-hub";
export type GraphNodeKind = "hub" | "memory" | "source-file" | "entity";

export interface GraphNode {
  id: string;
  label: string;
  type: MemoryItemType;
  kind: GraphNodeKind;
  decayScore: number;
  pinned: boolean;
  archived: boolean;
  hub?: HubRole;
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
  hubLink?: "root-to-hub" | "hub-to-item";
  sourceLink?: boolean;
  entityLink?: boolean;
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
  centerForce: 0.45,
  repelForce: 85,
  linkForce: 0.28,
  linkDistance: 58,
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
  sources?: SourceGraphDto[];
  sourceMemoryLinks?: SourceMemoryLinkDto[];
  entities?: EntityGraphDto[];
  entityMemoryLinks?: EntityMemoryLinkDto[];
}

export interface SourceGraphDto {
  id: string;
  kind: ProjectSourceKind;
  status: ProjectSourceStatus;
  displayName: string;
  originalFileName: string | null;
  mimeType: string | null;
  byteSize: number;
  updatedAt: string;
  sourceUri: string | null;
  chunkCount: number;
  tokenEstimate: number;
  previewText: string;
}

export interface SourceMemoryLinkDto {
  sourceId: string;
  memoryItemId: string;
  confidence: number;
}

export interface EntityGraphDto {
  id: string;
  name: string;
  kind: string;
  memoryItemIds: string[];
}

export interface EntityMemoryLinkDto {
  entityId: string;
  memoryItemId: string;
  confidence: number;
}

function truncateLabel(value: string, maxLength = 44) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

const HUB_NODE_PREFIX = "__hub__";
const ROOT_NODE_ID = "__root__";
const SOURCE_NODE_PREFIX = "__source__";
const ENTITY_NODE_PREFIX = "__entity__";

export function isHubNode(node: GraphNode) {
  return Boolean(node.hub) || node.id === ROOT_NODE_ID || node.id.startsWith(HUB_NODE_PREFIX);
}

function makeHubNode(type: MemoryItemType): GraphNode {
  return {
    id: `${HUB_NODE_PREFIX}${type}`,
    label: TYPE_LABELS[type],
    type,
    kind: "hub",
    decayScore: 1,
    pinned: false,
    archived: false,
    hub: "type-hub",
    sourceSurface: null,
    sourceUrl: null,
    content: `Hub node for ${TYPE_LABELS[type]}`,
    title: TYPE_LABELS[type],
    updatedAt: new Date().toISOString(),
    capturedAt: null,
    lastReaffirmedAt: null,
  };
}

function makeRootNode(projectName: string): GraphNode {
  return {
    id: ROOT_NODE_ID,
    label: projectName,
    type: "note" as MemoryItemType,
    kind: "hub",
    decayScore: 1,
    pinned: false,
    archived: false,
    hub: "root",
    sourceSurface: null,
    sourceUrl: null,
    content: projectName,
    title: projectName,
    updatedAt: new Date().toISOString(),
    capturedAt: null,
    lastReaffirmedAt: null,
  };
}

function makeSourceNode(source: SourceGraphDto): GraphNode {
  return {
    id: sourceNodeId(source.id),
    label: truncateLabel(source.displayName, 30),
    type: "artifact" as MemoryItemType,
    kind: "source-file",
    decayScore: source.status === "ready" ? 0.9 : 0.55,
    pinned: false,
    archived: source.status === "archived",
    sourceSurface: "web",
    sourceUrl: source.sourceUri,
    content: source.previewText || "No preview text extracted yet.",
    title: source.displayName,
    updatedAt: source.updatedAt,
    capturedAt: null,
    lastReaffirmedAt: null,
    source,
  };
}

function makeEntityNode(entity: EntityGraphDto): GraphNode {
  return {
    id: entityNodeId(entity.id),
    label: truncateLabel(entity.name, 30),
    type: "note" as MemoryItemType,
    kind: "entity",
    decayScore: 0.82,
    pinned: false,
    archived: false,
    sourceSurface: null,
    sourceUrl: null,
    content: `${entity.kind}: ${entity.name}`,
    title: entity.name,
    updatedAt: new Date().toISOString(),
    capturedAt: null,
    lastReaffirmedAt: null,
    entity,
  };
}

function sourceNodeId(sourceId: string) {
  return `${SOURCE_NODE_PREFIX}${sourceId}`;
}

function entityNodeId(entityId: string) {
  return `${ENTITY_NODE_PREFIX}${entityId}`;
}

export function buildGraphNodes(
  items: MemoryItemDto[],
  archivedIds?: Set<string>,
  projectName?: string,
  sources: SourceGraphDto[] = [],
  entities: EntityGraphDto[] = [],
): GraphNode[] {
  const itemNodes = items.map((item) => ({
    id: item.id,
    label: truncateLabel(item.title ?? item.content),
    type: item.type,
    kind: "memory" as const,
    decayScore: Number.isFinite(item.decayScore) ? item.decayScore : 0.5,
    pinned: item.pinned,
    archived: archivedIds?.has(item.id) ?? false,
    sourceSurface: item.sourceSurface,
    sourceUrl: item.sourceUrl,
    content: item.content,
    title: item.title,
    updatedAt: item.updatedAt,
    capturedAt: item.capturedAt,
    lastReaffirmedAt: item.lastReaffirmedAt,
    metadata: item.metadata,
  }));

  const presentTypes = new Set(items.map((i) => i.type));
  const hubNodes = Array.from(presentTypes).map(makeHubNode);
  const rootNode = makeRootNode(projectName ?? "Project");

  return [rootNode, ...hubNodes, ...sources.map(makeSourceNode), ...entities.map(makeEntityNode), ...itemNodes];
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
  sourceMemoryLinks: SourceMemoryLinkDto[] = [],
  entityMemoryLinks: EntityMemoryLinkDto[] = [],
): GraphLink[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const sourceLinkedMemoryIds = new Set(sourceMemoryLinks.map((link) => link.memoryItemId));
  const entityLinkedMemoryIds = new Set(entityMemoryLinks.map((link) => link.memoryItemId));

  const itemNodes = nodes.filter((n) => n.kind === "memory");
  const hubNodes = nodes.filter((n) => n.hub === "type-hub");
  const sourceNodes = nodes.filter((n) => n.kind === "source-file");

  // Memory v2: only emit the synthetic root → type-hub → item fallback when
  // there are too few real edges (DB relations + similarity + source/entity
  // links). Otherwise the hub-and-spoke "fake top-down" pattern dominates
  // the rendering even when meaningful structure exists.
  const REAL_EDGE_MIN = 8;
  const realEdgeCount =
    relations.length +
    similarityEdges.length +
    sourceMemoryLinks.length +
    entityMemoryLinks.length;
  const renderSyntheticHubs = realEdgeCount < REAL_EDGE_MIN;

  if (renderSyntheticHubs) {
    for (const hub of hubNodes) {
      links.push({
        source: ROOT_NODE_ID,
        target: hub.id,
        relationType: "extends",
        confidence: 1,
        fallback: true,
        hubLink: "root-to-hub",
      });
      seen.add(linkKey(ROOT_NODE_ID, hub.id, "extends"));

      for (const item of itemNodes) {
        if (item.type === hub.type && !sourceLinkedMemoryIds.has(item.id) && !entityLinkedMemoryIds.has(item.id)) {
          const key = linkKey(hub.id, item.id, "extends");
          links.push({
            source: hub.id,
            target: item.id,
            relationType: "extends",
            confidence: 0.8,
            fallback: true,
            hubLink: "hub-to-item",
          });
          seen.add(key);
        }
      }
    }
  }

  for (const source of sourceNodes) {
    links.push({
      source: ROOT_NODE_ID,
      target: source.id,
      relationType: "extends",
      confidence: 1,
      fallback: true,
      hubLink: "root-to-hub",
      sourceLink: true,
    });
  }

  for (const sourceLink of sourceMemoryLinks) {
    const sourceId = sourceNodeId(sourceLink.sourceId);
    if (!nodeIds.has(sourceId) || !nodeIds.has(sourceLink.memoryItemId)) continue;
    const key = linkKey(sourceId, sourceLink.memoryItemId, "derives");
    if (seen.has(key)) continue;
    links.push({
      source: sourceId,
      target: sourceLink.memoryItemId,
      relationType: "derives",
      confidence: sourceLink.confidence,
      sourceLink: true,
    });
    seen.add(key);
  }

  for (const entityLink of entityMemoryLinks) {
    const sourceId = entityNodeId(entityLink.entityId);
    if (!nodeIds.has(sourceId) || !nodeIds.has(entityLink.memoryItemId)) continue;
    const key = linkKey(sourceId, entityLink.memoryItemId, "mentions");
    if (seen.has(key)) continue;
    links.push({
      source: sourceId,
      target: entityLink.memoryItemId,
      relationType: "mentions",
      confidence: entityLink.confidence,
      entityLink: true,
    });
    seen.add(key);
  }

  // Explicit relations between items
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
  }

  // Similarity edges between items
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
