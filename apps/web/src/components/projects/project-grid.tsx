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
        <Link key={project.id} href={`/dashboard?project=${project.id}`}>
          <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent p-5 transition hover:bg-[var(--relay-soft)]">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-medium tracking-tight text-[var(--relay-ink)]">
                {project.name}
              </h3>
              <span className="shrink-0 text-[11px] text-[var(--relay-faint)]">
                {project.slug}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--relay-muted)] line-clamp-2">
              {project.description || "No purpose defined."}
            </p>
            <div className="mt-4 flex gap-4 text-xs font-medium text-[var(--relay-ink-secondary)]">
              <span>{project.memoryCount} attributes saved</span>
              <span>{project.sessionCount} related chats</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
