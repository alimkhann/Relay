"use client";

import { FadeIn } from "@/components/ui/fade-in";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectDashboard } from "@/features/projects/use-project-dashboard";
import { useMemoryCacheSync } from "@/lib/query/memory-cache-sync";
import { MemoryGraphContainer } from "./memory-graph-container";

interface GraphPageContentProps {
  project: { id: string; name: string; description?: string | null };
}

export function GraphPageContent({ project }: GraphPageContentProps) {
  const { data: dashboard, isPending } = useProjectDashboard(project.id);
  useMemoryCacheSync(project.id);

  return (
    <div className="min-h-[calc(100vh-4rem)] pt-6">
      <FadeIn>
        <div className="mb-4">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Graph
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            {project.name} memory, mapped from persisted sources, entities, conversations, and relation evidence.
          </p>
        </div>
      </FadeIn>

      {!dashboard ? (
        isPending ? (
          <Skeleton className="min-h-[calc(100vh-9rem)] w-full rounded-[var(--relay-radius)]" />
        ) : (
          <EmptyState
            title="No data yet"
            description="The graph appears after your first chat capture."
            className="py-12"
          />
        )
      ) : (
        <FadeIn delay={0.04}>
          <MemoryGraphContainer
            projectId={project.id}
            projectName={project.name}
            memoryItems={dashboard.memory}
            mode="fullscreen"
            title={`${project.name} Graph`}
            className="min-h-[calc(100vh-9rem)]"
          />
        </FadeIn>
      )}
    </div>
  );
}
