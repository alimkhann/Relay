import React from "react"

import { AppShell } from "@/components/layout/app-shell"
import { ProjectGrid } from "@/components/projects/project-grid"
import { ContextPreview } from "@/features/context/context-preview"
import { ProjectSummaryCard } from "@/features/projects/project-summary-card"
import { listProjectsForUser, getProjectDashboardForUser } from "@/server/services/project-service"
import type { MemoryItemDto } from "@relay/shared"

export default async function DashboardPage() {
  const userId = process.env.RELAY_DEFAULT_USER_ID ?? "demo-user"
  const projects = await listProjectsForUser(userId)
  const dashboard = projects[0] ? await getProjectDashboardForUser(userId, projects[0].id) : null

  return (
    <AppShell>
      <div className="grid gap-5 md:grid-cols-3">
        <ProjectSummaryCard title="Projects" value={String(projects.length)} icon="projects" />
        <ProjectSummaryCard
          title="Pinned memory"
          value={String(dashboard?.memory.filter((item: MemoryItemDto) => item.pinned).length ?? 0)}
          icon="memory"
        />
        <ProjectSummaryCard title="Recent sessions" value={String(dashboard?.recentSessions.length ?? 0)} icon="sessions" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Projects</p>
            <h1 className="mt-2 font-serif text-4xl tracking-tight">Current workspace</h1>
          </div>
          <ProjectGrid projects={projects} />
        </section>
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Context</p>
            <h2 className="mt-2 font-serif text-3xl tracking-tight">Latest packet</h2>
          </div>
          <ContextPreview packet={dashboard?.packets[0] ?? null} />
        </section>
      </div>
    </AppShell>
  )
}
