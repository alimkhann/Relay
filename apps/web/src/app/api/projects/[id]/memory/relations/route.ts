import { NextResponse } from "next/server";
import { createRepositoryBundle } from "@relay/db";

import { withApiAuth } from "@/server/http/api-route";
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer";

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"));
  const { id } = await params;
  requireViewerProject(viewer, id, "memory:read");

  const repositories = createRepositoryBundle(viewer.userId);
  const [relations, similarityEdges] = await Promise.all([
    repositories.memory.getRelationsForProject(id),
    repositories.memory.getSimilarityEdgesForProject(id),
  ]);

  return NextResponse.json({
    relations: relations.map((relation) => ({
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      relationType: relation.relationType,
      confidence: relation.confidence,
    })),
    similarityEdges,
  });
});
