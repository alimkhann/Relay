"use client";

import type { ProjectDashboardDto } from "@relay/shared";

import { FadeIn } from "@/components/ui/fade-in";
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

      <FadeIn delay={0.04}>
        <MemoryGraphContainer
          projectId={project.id}
          projectName={project.name}
          memoryItems={memoryItems}
          mode="fullscreen"
          title={`${project.name} Graph`}
          className="min-h-[calc(100vh-9rem)]"
        />
      </FadeIn>
    </div>
  );
}
