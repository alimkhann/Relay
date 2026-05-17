import { NextResponse } from "next/server";
import { createRepositoryBundle, type SourceMemoryLinkRow } from "@relay/db";
import type { ProjectSourceRow } from "@relay/shared";

import { withApiAuth } from "@/server/http/api-route";
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer";

interface SourceDetail {
  id: string;
  kind: ProjectSourceRow["kind"];
  status: ProjectSourceRow["status"];
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

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"));
  const { id } = await params;
  requireViewerProject(viewer, id, "memory:read");

  const repositories = createRepositoryBundle(viewer.userId);
  const [relations, similarityEdges] = await Promise.all([
    repositories.memory.getRelationsForProject(id),
    repositories.memory.getSimilarityEdgesForProject(id),
  ]);

  let sourceDetails: SourceDetail[] = [];
  let sourceMemoryLinks: SourceMemoryLinkRow[] = [];
  let entityDetails: Array<{ id: string; name: string; kind: string; memoryItemIds: string[] }> = [];
  let entityMemoryLinks: Array<{ entityId: string; memoryItemId: string; confidence: number }> = [];

  try {
    const [sources, links] = await Promise.all([
      repositories.sources.listByProject(id),
      repositories.sources.listMemoryLinksByProject(id),
    ]);

    const sourceIds = sources.map((s) => s.id);
    const [versionsBySourceId, firstChunksBySourceId] = await Promise.all([
      repositories.sources.getLatestVersionsBySourceIds(sourceIds),
      repositories.sources.getFirstChunksBySourceIds(sourceIds),
    ]);

    sourceDetails = sources.map((source) => {
      const latestVersion = versionsBySourceId.get(source.id) ?? null;
      const firstChunk = firstChunksBySourceId.get(source.id) ?? null;
      return {
        id: source.id,
        kind: source.kind,
        status: source.status,
        displayName: source.displayName,
        originalFileName: source.originalFileName,
        mimeType: source.mimeType,
        byteSize: source.byteSize,
        updatedAt: source.updatedAt,
        sourceUri: source.sourceUri,
        chunkCount: latestVersion?.chunkCount ?? 0,
        tokenEstimate: latestVersion?.tokenEstimate ?? 0,
        previewText: firstChunk?.content.slice(0, 1200) ?? "",
      };
    });
    sourceMemoryLinks = links;
  } catch {
    // Sources tables may not exist yet (migration 0037)
  }

  try {
    const mentions = await repositories.entities.listMentionsByProject(id);
    const entities = new Map<string, { id: string; name: string; kind: string; memoryItemIds: Set<string> }>();
    entityMemoryLinks = mentions.map((mention) => {
      const entry = entities.get(mention.entityId) ?? {
        id: mention.entityId,
        name: mention.entityName,
        kind: mention.entityKind,
        memoryItemIds: new Set<string>(),
      };
      entry.memoryItemIds.add(mention.memoryItemId);
      entities.set(mention.entityId, entry);
      return {
        entityId: mention.entityId,
        memoryItemId: mention.memoryItemId,
        confidence: 0.84,
      };
    });
    entityDetails = Array.from(entities.values()).map((entity) => ({
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      memoryItemIds: Array.from(entity.memoryItemIds),
    }));
  } catch {
    // Entity graph tables may not exist yet during migration rollout.
  }

  return NextResponse.json({
    relations: relations.map((relation) => ({
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      relationType: relation.relationType,
      confidence: relation.confidence,
    })),
    similarityEdges,
    sources: sourceDetails,
    sourceMemoryLinks,
    entities: entityDetails,
    entityMemoryLinks,
  });
});
