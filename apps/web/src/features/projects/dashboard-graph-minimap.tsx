"use client";

import type { MemoryItemDto } from "@relay/shared";

import { MemoryGraphContainer } from "@/features/graph/memory-graph-container";

interface DashboardGraphMinimapProps {
  projectId: string;
  memoryItems: MemoryItemDto[];
}

export function DashboardGraphMinimap({ projectId, memoryItems }: DashboardGraphMinimapProps) {
  return (
    <MemoryGraphContainer
      projectId={projectId}
      memoryItems={memoryItems}
      variant="minimap"
    />
  );
}
