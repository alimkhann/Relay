import type {
  MemoryItemRow,
  MemoryRelationRow,
  ProjectGraphDensity,
  ProjectGraphEdge,
  ProjectGraphNode,
  ProjectGraphSnapshot,
  ProjectSourceRow,
  SourceSessionRow,
} from "@relay/shared"

interface GraphEntityMention {
  entityId: string
  entityName: string
  entityKind: string
  memoryItemId: string
}

interface GraphEntity {
  id: string
  name: string
  kind: string
}

interface GraphEntityRelation {
  id: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  confidence: number
}

interface GraphObservation {
  id: string
  content: string
  sourceMemoryItemId: string | null
  subjectEntityId: string | null
  objectEntityId: string | null
  predicate: string | null
  confidence: number
  validFrom: string
  metadata: Record<string, unknown>
}

interface GraphSourceLink {
  sourceId: string
  memoryItemId: string
  confidence: number
}

interface GraphConversation {
  conversationId: string
  platform: SourceSessionRow["platform"]
  title: string | null
  url: string
  captureCount: number
  totalTurns: number
  lastCapturedAt: string
}

export interface ProjectGraphRepositories {
  memory: {
    listByProject(projectId: string, options: { limit: number }): Promise<MemoryItemRow[]>
    getRelationsForProject(projectId: string, options: { limit: number }): Promise<MemoryRelationRow[]>
  }
  sources: {
    listByProject(projectId: string, options: { limit: number }): Promise<ProjectSourceRow[]>
    listMemoryLinksByProject(projectId: string, options: { limit: number }): Promise<GraphSourceLink[]>
    getLatestVersionsBySourceIds?(
      sourceIds: string[],
    ): Promise<Map<string, { chunkCount: number; tokenEstimate: number }>>
  }
  entities: {
    listByProject(projectId: string): Promise<GraphEntity[]>
    listMentionsByProject(projectId: string): Promise<GraphEntityMention[]>
  }
  entityRelations: {
    listByProject(projectId: string, options: { limit: number }): Promise<GraphEntityRelation[]>
  }
  observations: {
    listByProject(projectId: string, options: { lifecycleStates: Array<"active" | "cooling">; limit: number }): Promise<GraphObservation[]>
  }
  sessions: {
    getGroupedSessions(projectId: string, options: { limit: number }): Promise<GraphConversation[]>
  }
}

const BUDGETS = {
  compact: {
    nodes: 80,
    edges: 180,
    memory: 45,
    entities: 15,
    sources: 10,
    conversations: 10,
    observations: 0,
  },
  full: {
    nodes: 300,
    edges: 900,
    memory: 160,
    entities: 45,
    sources: 30,
    conversations: 35,
    observations: 30,
  },
} as const

function textLabel(value: string, max = 72) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trim()}…`
}

function edgeId(kind: ProjectGraphEdge["kind"], source: string, target: string, suffix = "") {
  return `${kind}:${source}:${target}${suffix ? `:${suffix}` : ""}`
}

export async function buildProjectGraphSnapshot(
  repositories: ProjectGraphRepositories,
  projectId: string,
  options: { density: ProjectGraphDensity; includeEvidence: boolean },
): Promise<ProjectGraphSnapshot> {
  const budget = BUDGETS[options.density]
  const [memories, memoryRelations, sources, sourceLinks, entities, mentions, entityRelations, conversations, observations] =
    await Promise.all([
      repositories.memory.listByProject(projectId, { limit: budget.memory }),
      repositories.memory.getRelationsForProject(projectId, { limit: budget.edges }),
      repositories.sources.listByProject(projectId, { limit: budget.sources }),
      repositories.sources.listMemoryLinksByProject(projectId, { limit: budget.edges }),
      repositories.entities.listByProject(projectId),
      repositories.entities.listMentionsByProject(projectId),
      repositories.entityRelations.listByProject(projectId, { limit: budget.edges }),
      repositories.sessions.getGroupedSessions(projectId, { limit: budget.conversations }),
      options.includeEvidence
        ? repositories.observations.listByProject(projectId, {
            lifecycleStates: ["active", "cooling"],
            limit: budget.observations,
          })
        : Promise.resolve([]),
    ])

  const nodes: ProjectGraphNode[] = []
  const addNode = (node: ProjectGraphNode) => {
    if (nodes.length < budget.nodes) nodes.push(node)
  }

  for (const memory of memories.slice(0, budget.memory)) {
    addNode({
      id: `memory:${memory.id}`,
      kind: "memory",
      label: textLabel(memory.title ?? memory.content),
      content: memory.content,
      updatedAt: memory.updatedAt,
      metadata: memory.metadata ?? {},
      memory: {
        id: memory.id,
        type: memory.type,
        title: memory.title,
        pinned: memory.pinned,
        sourceSurface: memory.sourceSurface,
        sourceUrl: memory.sourceUrl,
        capturedAt: memory.capturedAt,
        lastReaffirmedAt: memory.lastReaffirmedAt,
      },
    })
  }

  const entityMap = new Map<string, GraphEntity>()
  for (const entity of entities) {
    entityMap.set(entity.id, entity)
  }
  for (const mention of mentions) {
    if (!entityMap.has(mention.entityId)) {
      entityMap.set(mention.entityId, {
        id: mention.entityId,
        name: mention.entityName,
        kind: mention.entityKind,
      })
    }
  }
  for (const entity of Array.from(entityMap.values()).slice(0, budget.entities)) {
    addNode({
      id: `entity:${entity.id}`,
      kind: "entity",
      label: textLabel(entity.name),
      content: `${entity.kind}: ${entity.name}`,
      updatedAt: "",
      metadata: {},
      entity: { id: entity.id, kind: entity.kind },
    })
  }

  const sourceSlice = sources.slice(0, budget.sources)
  const versionsBySourceId = repositories.sources.getLatestVersionsBySourceIds
    ? await repositories.sources.getLatestVersionsBySourceIds(sourceSlice.map((source) => source.id))
    : new Map<string, { chunkCount: number; tokenEstimate: number }>()

  for (const source of sourceSlice) {
    const latestVersion = versionsBySourceId.get(source.id)
    addNode({
      id: `source:${source.id}`,
      kind: "source",
      label: textLabel(source.displayName),
      content: source.displayName,
      updatedAt: source.updatedAt,
      metadata: source.metadata ?? {},
      source: {
        id: source.id,
        kind: source.kind,
        status: source.status,
        sourceUri: source.sourceUri,
        originalFileName: source.originalFileName,
        mimeType: source.mimeType,
        byteSize: source.byteSize,
        chunkCount: latestVersion?.chunkCount,
        tokenEstimate: latestVersion?.tokenEstimate,
      },
    })
  }

  for (const conversation of conversations.slice(0, budget.conversations)) {
    addNode({
      id: `conversation:${conversation.conversationId}`,
      kind: "conversation",
      label: textLabel(conversation.title ?? `${conversation.platform} conversation`),
      content: `${conversation.captureCount} captures · ${conversation.totalTurns} turns`,
      updatedAt: conversation.lastCapturedAt,
      metadata: {},
      conversation: {
        id: conversation.conversationId,
        platform: conversation.platform,
        url: conversation.url,
        captureCount: conversation.captureCount,
        totalTurns: conversation.totalTurns,
      },
    })
  }

  for (const observation of observations.slice(0, budget.observations)) {
    addNode({
      id: `observation:${observation.id}`,
      kind: "observation",
      label: textLabel(observation.content),
      content: observation.content,
      updatedAt: observation.validFrom,
      metadata: observation.metadata ?? {},
      observation: {
        id: observation.id,
        predicate: observation.predicate,
        confidence: observation.confidence,
      },
    })
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges: ProjectGraphEdge[] = []
  const seenEdges = new Set<string>()
  const addEdge = (edge: ProjectGraphEdge) => {
    if (edges.length >= budget.edges || seenEdges.has(edge.id)) return
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return
    seenEdges.add(edge.id)
    edges.push(edge)
  }

  for (const relation of memoryRelations) {
    const source = `memory:${relation.sourceId}`
    const target = `memory:${relation.targetId}`
    addEdge({
      id: edgeId("memory_relation", source, target, relation.relationType),
      source,
      target,
      kind: "memory_relation",
      label: relation.relationType,
      confidence: relation.confidence,
    })
  }

  for (const mention of mentions) {
    const source = `entity:${mention.entityId}`
    const target = `memory:${mention.memoryItemId}`
    addEdge({
      id: edgeId("mentions", source, target),
      source,
      target,
      kind: "mentions",
      label: "mentions",
      confidence: 0.84,
    })
  }

  for (const relation of entityRelations) {
    const source = `entity:${relation.sourceEntityId}`
    const target = `entity:${relation.targetEntityId}`
    addEdge({
      id: edgeId("entity_relation", source, target, relation.relationType),
      source,
      target,
      kind: "entity_relation",
      label: relation.relationType,
      confidence: relation.confidence,
    })
  }

  for (const link of sourceLinks) {
    const source = `source:${link.sourceId}`
    const target = `memory:${link.memoryItemId}`
    addEdge({
      id: edgeId("derived_from", source, target),
      source,
      target,
      kind: "derived_from",
      label: "derived from",
      confidence: link.confidence,
    })
  }

  const conversationIds = new Set(conversations.map((conversation) => conversation.conversationId))
  for (const memory of memories) {
    if (!memory.sourceConversationId || !conversationIds.has(memory.sourceConversationId)) continue
    const source = `conversation:${memory.sourceConversationId}`
    const target = `memory:${memory.id}`
    addEdge({
      id: edgeId("captured_in", source, target),
      source,
      target,
      kind: "captured_in",
      label: "captured in",
      confidence: 1,
    })
  }

  for (const observation of observations) {
    const source = `observation:${observation.id}`
    const targets = [
      observation.sourceMemoryItemId ? `memory:${observation.sourceMemoryItemId}` : null,
      observation.subjectEntityId ? `entity:${observation.subjectEntityId}` : null,
      observation.objectEntityId ? `entity:${observation.objectEntityId}` : null,
    ].filter((target): target is string => Boolean(target))
    for (const target of targets) {
      addEdge({
        id: edgeId("supports", source, target),
        source,
        target,
        kind: "supports",
        label: observation.predicate ?? "supports",
        confidence: observation.confidence,
      })
    }
  }

  const connectedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
  const availableNodeCount =
    memories.length + entityMap.size + sources.length + conversations.length + observations.length

  return {
    projectId,
    density: options.density,
    includeEvidence: options.includeEvidence,
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      isolatedNodeCount: nodes.filter((node) => !connectedIds.has(node.id)).length,
      truncated: availableNodeCount > nodes.length || edges.length >= budget.edges,
    },
  }
}
