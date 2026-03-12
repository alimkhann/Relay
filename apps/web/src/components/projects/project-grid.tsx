import Link from "next/link";
import type { ProjectSummaryDto } from "@relay/shared";

export function ProjectGrid({ projects }: { projects: ProjectSummaryDto[] }) {
  if (projects.length === 0) {
    return (
      <p className="text-sm text-[var(--relay-muted)]">
        No projects yet. Create one to get started.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {projects.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`}>
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4 shadow-[var(--relay-shadow-sm)] transition hover:border-[var(--relay-line-strong)] hover:shadow-[var(--relay-shadow)]">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold tracking-tight text-[var(--relay-ink)]">
                {project.name}
              </h3>
              <span className="shrink-0 text-xs text-[var(--relay-faint)]">
                {project.slug}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-[var(--relay-muted)] line-clamp-2">
              {project.description || "No description yet."}
            </p>
            <div className="mt-3 flex gap-4 text-xs text-[var(--relay-faint)]">
              <span>{project.memoryCount} saved</span>
              <span>{project.sessionCount} chats</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
