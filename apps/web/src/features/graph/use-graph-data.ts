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

interface UseGraphDataResult {
  data: GraphData;
  loading: boolean;
  error: string | null;
}

export function useGraphData(projectId: string, memoryItems: MemoryItemDto[]): UseGraphDataResult {
  const [relationsData, setRelationsData] = useState<RelationsResponse>({
    relations: [],
    similarityEdges: [],
  });
  const [loading, setLoading] = useState(memoryItems.length > 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (memoryItems.length === 0) {
      setRelationsData({ relations: [], similarityEdges: [] });
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await relayClientFetch(`/api/projects/${projectId}/memory/relations`, {
          telemetry: {
            area: "graph",
            event: "graph.relations.fetch",
            context: { projectId },
          },
        });

        if (!response.ok) {
          throw new Error("Unable to load graph relations.");
        }

        const payload = (await response.json()) as RelationsResponse;
        if (!cancelled) {
          setRelationsData({
            relations: Array.isArray(payload.relations) ? payload.relations : [],
            similarityEdges: Array.isArray(payload.similarityEdges) ? payload.similarityEdges : [],
          });
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setRelationsData({ relations: [], similarityEdges: [] });
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
    const nodes = buildGraphNodes(memoryItems);
    return {
      nodes,
      links: buildGraphLinks(nodes, relationsData.relations, relationsData.similarityEdges),
    };
  }, [memoryItems, relationsData]);

  return { data, loading, error };
}
