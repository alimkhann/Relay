import { notFound } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { MemoryList } from "@/components/memory/memory-list"
import { getProjectDashboardForUser } from "@/server/services/project-service"

export default async function ProjectMemoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const userId = process.env.RELAY_DEFAULT_USER_ID ?? "demo-user"
  const dashboard = await getProjectDashboardForUser(userId, projectId)

  if (!dashboard) notFound()

  return (
    <AppShell>
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Memory</p>
        <h1 className="font-serif text-4xl tracking-tight">{dashboard.project.name}</h1>
      </div>
      <MemoryList items={dashboard.memory} />
    </AppShell>
  )
}
