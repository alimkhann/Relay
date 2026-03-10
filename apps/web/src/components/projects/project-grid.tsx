import Link from "next/link"
import type { ProjectSummaryDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function ProjectGrid({ projects }: { projects: ProjectSummaryDto[] }) {
  if (projects.length === 0) {
    return (
      <div className="rounded-[30px] border border-dashed border-[var(--relay-line)] bg-white/70 p-6 text-sm leading-7 text-[var(--relay-muted)]">
        No projects yet. Capture a supported thread or create a project through the API to give Relay a home for new memory.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`}>
          <Card className="h-full border-[var(--relay-line)] bg-white/82 p-5 transition hover:-translate-y-0.5 hover:bg-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">{project.name}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">{project.description || "No project description yet."}</p>
              </div>
              <span className="rounded-full bg-[var(--relay-soft)] px-3 py-1 text-xs text-[var(--relay-muted)]">{project.slug}</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--relay-muted)]">
              <span>{project.memoryCount} memory items</span>
              <span>{project.sessionCount} sessions</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
