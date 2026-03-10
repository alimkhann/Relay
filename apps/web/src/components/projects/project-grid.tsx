import Link from "next/link"
import type { ProjectSummaryDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function ProjectGrid({ projects }: { projects: ProjectSummaryDto[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`}>
          <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-[0_32px_80px_-45px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{project.name}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{project.description}</p>
              </div>
              <span className="rounded-full bg-stone-950/5 px-3 py-1 text-xs text-stone-600">{project.slug}</span>
            </div>
            <div className="mt-6 flex gap-3 text-sm text-stone-600">
              <span>{project.memoryCount} memory items</span>
              <span>{project.sessionCount} sessions</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
