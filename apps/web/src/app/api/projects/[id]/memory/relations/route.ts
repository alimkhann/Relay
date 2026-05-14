import { NextResponse } from "next/server";
import { createRepositoryBundle } from "@relay/db";

import { withApiAuth } from "@/server/http/api-route";
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer";

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"));
  const { id } = await params;
  requireViewerProject(viewer, id, "memory:read");

  const repositories = createRepositoryBundle(viewer.userId);
  const [relations, similarityEdges, sources, sourceMemoryLinks] = await Promise.all([
    repositories.memory.getRelationsForProject(id),
    repositories.memory.getSimilarityEdgesForProject(id),
    repositories.sources.listByProject(id),
    repositories.sources.listMemoryLinksByProject(id),
  ]);

  const sourceDetails = await Promise.all(sources.map(async (source) => {
    const [latestVersion, chunks] = await Promise.all([
      repositories.sources.getLatestVersion(source.id),
      repositories.sources.listChunks(source.id, { limit: 1 }),
    ]);
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
      previewText: chunks[0]?.content.slice(0, 1200) ?? "",
    };
  }));

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
  });
});
