import Link from "next/link"
import { notFound } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { PacketList } from "@/components/context/packet-list"
import { MemoryList } from "@/components/memory/memory-list"
import { SessionList } from "@/components/sessions/session-list"
import { Button } from "@/components/ui/button"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const viewer = await requireSessionViewer()
  const { projectId } = await params
  const dashboard = await getProjectDashboardForUser(viewer.userId, projectId)

  if (!dashboard) {
    notFound()
  }

  return (
    <AppShell>
      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[34px] border border-[var(--relay-line)] bg-[#193021] p-7 text-white shadow-[var(--relay-shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/68">Project</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">{dashboard.project.name}</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/82">
            {dashboard.project.description || "This project does not have a written description yet."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
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
        <div className="rounded-[34px] border border-[var(--relay-line)] bg-white/84 p-7 shadow-[var(--relay-shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">At a glance</p>
          <div className="mt-5 grid gap-3">
            {[
              [`${dashboard.recentSessions.length}`, "recent captures"],
              [`${dashboard.memory.length}`, "memory items"],
              [`${dashboard.packets.length}`, "context packets"]
            ].map(([value, label]) => (
              <div key={label} className="rounded-[22px] bg-[var(--relay-soft)] px-4 py-4">
                <p className="text-2xl font-semibold text-[var(--relay-ink)]">{value}</p>
                <p className="mt-1 text-sm text-[var(--relay-muted)]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Pinned memory</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">What should survive the next switch</h2>
          </div>
          <MemoryList items={dashboard.memory.filter((item) => item.pinned).slice(0, 4)} />
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent captures</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Latest thread fragments</h2>
          </div>
          <SessionList sessions={dashboard.recentSessions.slice(0, 4)} />
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Context history</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Packets already composed for this project</h2>
        </div>
        <PacketList packets={dashboard.packets} />
      </section>
    </AppShell>
  )
}
