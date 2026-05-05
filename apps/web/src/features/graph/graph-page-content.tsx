"use client";

import type { ProjectDashboardDto } from "@relay/shared";

import { EmptyState } from "@/components/ui/empty-state";
import { FadeIn } from "@/components/ui/fade-in";
import { MIN_GRAPH_ITEMS } from "./memory-graph-utils";
import { MemoryGraphContainer } from "./memory-graph-container";

interface GraphPageContentProps {
  project: { id: string; name: string; description?: string | null };
  dashboard: ProjectDashboardDto;
}

export function GraphPageContent({ project, dashboard }: GraphPageContentProps) {
  const memoryItems = dashboard.memory;

  return (
    <div className="min-h-[calc(100vh-4rem)] pt-6">
      <FadeIn>
        <div className="mb-4">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Graph
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            {project.name} memory, mapped by relations and semantic similarity.
          </p>
        </div>
      </FadeIn>

      {memoryItems.length >= MIN_GRAPH_ITEMS ? (
        <FadeIn delay={0.04}>
          <MemoryGraphContainer
            projectId={project.id}
            memoryItems={memoryItems}
            mode="fullscreen"
            title={`${project.name} Graph`}
            className="min-h-[calc(100vh-9rem)]"
          />
        </FadeIn>
      ) : (
        <EmptyState
          title="Not enough memory yet"
          description="The graph appears after Relay has at least 8 memory items for this project."
          className="py-16"
        />
      )}
    </div>
  );
}
