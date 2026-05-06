"use client";

import type { MemoryItemDto } from "@relay/shared";

import { MemoryGraphContainer } from "@/features/graph/memory-graph-container";

interface DashboardGraphMinimapProps {
  projectId: string;
  projectName?: string;
  memoryItems: MemoryItemDto[];
}

export function DashboardGraphMinimap({ projectId, projectName, memoryItems }: DashboardGraphMinimapProps) {
  return (
    <MemoryGraphContainer
      projectId={projectId}
      projectName={projectName}
      memoryItems={memoryItems}
      variant="minimap"
    />
  );
}
