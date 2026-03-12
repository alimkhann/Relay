import { notFound } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { MemoryList } from "@/components/memory/memory-list"
import { requirePageViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function ProjectMemoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const viewer = await requirePageViewer(`/projects/${projectId}/memory`)
  const dashboard = await getProjectDashboardForUser(viewer.userId, projectId)

  if (!dashboard) notFound()

  return (
    <AppShell>
      <section className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Memory</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[var(--relay-ink)]">{dashboard.project.name}</h1>
        </div>
        <MemoryList items={dashboard.memory} />
      </section>
    </AppShell>
  )
}
