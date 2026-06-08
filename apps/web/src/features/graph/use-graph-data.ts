"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProjectGraphDensity, ProjectGraphSnapshot } from "@relay/shared";

import { relayClientFetch } from "@/lib/telemetry/fetch";
import {
  filterGraphData,
  snapshotToGraphData,
  type GraphData,
  type GraphFilters,
} from "./memory-graph-utils";

interface UseGraphDataResult {
  data: GraphData;
  loading: boolean;
  error: string | null;
}

export function useGraphData(
  projectId: string,
  options: { density: ProjectGraphDensity; includeEvidence: boolean; filters?: GraphFilters },
): UseGraphDataResult {
  const [snapshot, setSnapshot] = useState<ProjectGraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      density: options.density,
      includeEvidence: options.includeEvidence ? "true" : "false",
    });

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await relayClientFetch(`/api/projects/${projectId}/graph?${params.toString()}`, {
          telemetry: {
            area: "graph",
            event: "graph.snapshot.fetch",
            context: { projectId, density: options.density, includeEvidence: options.includeEvidence },
          },
        });

        if (!response.ok) {
          throw new Error("Unable to load memory graph.");
        }

        const payload = (await response.json()) as ProjectGraphSnapshot;
        if (!cancelled) {
          setSnapshot(payload);
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setSnapshot(null);
          setError(cause instanceof Error ? cause.message : "Unable to load memory graph.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, options.density, options.includeEvidence]);

  const data = useMemo(() => {
    const graphData = snapshot ? snapshotToGraphData(snapshot) : { nodes: [], links: [] };
    return filterGraphData(graphData, options.filters ?? {});
  }, [snapshot, options.filters]);

  return { data, loading, error };
}
