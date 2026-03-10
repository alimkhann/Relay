import Link from "next/link"
import { notFound } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { PacketList } from "@/components/context/packet-list"
import { MemoryList } from "@/components/memory/memory-list"
import { SessionList } from "@/components/sessions/session-list"
import { Button } from "@/components/ui/button"
import { getProjectDashboardForUser } from "@/server/services/project-service"

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const userId = process.env.RELAY_DEFAULT_USER_ID ?? "demo-user"
  const dashboard = await getProjectDashboardForUser(userId, projectId)

  if (!dashboard) {
    notFound()
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Project</p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight">{dashboard.project.name}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-stone-700">{dashboard.project.description}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" asChild>
            <Link href={`/projects/${projectId}/memory`}>Memory</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/projects/${projectId}/sessions`}>Sessions</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/projects/${projectId}/packets`}>Packets</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-serif text-2xl tracking-tight">Pinned memory</h2>
          <MemoryList items={dashboard.memory.slice(0, 4)} />
        </section>
        <section className="space-y-4">
          <h2 className="font-serif text-2xl tracking-tight">Recent sessions</h2>
          <SessionList sessions={dashboard.recentSessions.slice(0, 4)} />
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl tracking-tight">Context history</h2>
        <PacketList packets={dashboard.packets} />
      </section>
    </AppShell>
  )
}
