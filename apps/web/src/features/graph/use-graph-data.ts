"use client";

import { useEffect, useMemo, useState } from "react";
import type { MemoryItemDto } from "@relay/shared";

import { relayClientFetch } from "@/lib/telemetry/fetch";
import {
  buildGraphLinks,
  buildGraphNodes,
  type GraphData,
  type RelationsResponse,
} from "./memory-graph-utils";

interface ArchivedItemResponse {
  id: string;
  type: MemoryItemDto["type"];
  title: string | null;
  content: string;
  pinned: boolean;
  isArchived: boolean;
  updatedAt?: string;
  provenance?: {
    sourceSurface?: string | null;
    sourceUrl?: string | null;
    capturedAt?: string | null;
  };
  status?: {
    lastReaffirmedAt?: string | null;
  };
}

function toMemoryItemDto(item: ArchivedItemResponse): MemoryItemDto {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    pinned: item.pinned,
    updatedAt: item.updatedAt ?? new Date().toISOString(),
    sourceSurface: (item.provenance?.sourceSurface as MemoryItemDto["sourceSurface"]) ?? null,
    sourceUrl: item.provenance?.sourceUrl ?? null,
    capturedAt: item.provenance?.capturedAt ?? null,
    decayScore: 0.1,
    lastReaffirmedAt: item.status?.lastReaffirmedAt ?? null,
  };
}

interface UseGraphDataResult {
  data: GraphData;
  loading: boolean;
  error: string | null;
}

export function useGraphData(projectId: string, memoryItems: MemoryItemDto[], projectName?: string): UseGraphDataResult {
  const [relationsData, setRelationsData] = useState<RelationsResponse>({
    relations: [],
    similarityEdges: [],
  });
  const [archivedItems, setArchivedItems] = useState<MemoryItemDto[]>([]);
  const [loading, setLoading] = useState(memoryItems.length > 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (memoryItems.length === 0) {
      setRelationsData({ relations: [], similarityEdges: [] });
      setArchivedItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [relationsRes, archivedRes] = await Promise.all([
          relayClientFetch(`/api/projects/${projectId}/memory/relations`, {
            telemetry: {
              area: "graph",
              event: "graph.relations.fetch",
              context: { projectId },
            },
          }),
          relayClientFetch(`/api/projects/${projectId}/memory?archived=true`, {
            telemetry: {
              area: "graph",
              event: "graph.archived.fetch",
              context: { projectId },
            },
          }),
        ]);

        if (!relationsRes.ok) {
          throw new Error("Unable to load graph relations.");
        }

        const relationsPayload = (await relationsRes.json()) as RelationsResponse;
        const archivedPayload = archivedRes.ok
          ? ((await archivedRes.json()) as { memory: ArchivedItemResponse[] })
          : { memory: [] as ArchivedItemResponse[] };

        if (!cancelled) {
          setRelationsData({
            relations: Array.isArray(relationsPayload.relations) ? relationsPayload.relations : [],
            similarityEdges: Array.isArray(relationsPayload.similarityEdges) ? relationsPayload.similarityEdges : [],
          });
          setArchivedItems(
            Array.isArray(archivedPayload.memory)
              ? archivedPayload.memory.filter((i) => i.isArchived).map(toMemoryItemDto)
              : [],
          );
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setRelationsData({ relations: [], similarityEdges: [] });
          setArchivedItems([]);
          setError(cause instanceof Error ? cause.message : "Unable to load graph relations.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, memoryItems.length]);

  const data = useMemo(() => {
    const activeIds = new Set(memoryItems.map((i) => i.id));
    const deduped = archivedItems.filter((i) => !activeIds.has(i.id));
    const archivedIds = new Set(deduped.map((i) => i.id));
    const allItems = [...memoryItems, ...deduped];
    const nodes = buildGraphNodes(allItems, archivedIds, projectName);
    return {
      nodes,
      links: buildGraphLinks(nodes, relationsData.relations, relationsData.similarityEdges),
    };
  }, [memoryItems, archivedItems, relationsData, projectName]);

  return { data, loading, error };
}
