import Link from "next/link"

import { AppShell } from "@/components/layout/app-shell"
import { PacketList } from "@/components/context/packet-list"
import { MemoryList } from "@/components/memory/memory-list"
import { ProjectGrid } from "@/components/projects/project-grid"
import { SessionList } from "@/components/sessions/session-list"
import { Button } from "@/components/ui/button"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser, listProjectsForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const viewer = await requireSessionViewer()
  const projects = await listProjectsForUser(viewer.userId)
  const currentProject = projects[0] ?? null
  const dashboard = currentProject ? await getProjectDashboardForUser(viewer.userId, currentProject.id) : null
  const pinnedMemory = dashboard?.memory.filter((item) => item.pinned) ?? []

  return (
    <AppShell>
      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[34px] border border-[var(--relay-line)] bg-[#193021] p-7 text-white shadow-[var(--relay-shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/68">Dashboard</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            {currentProject ? currentProject.name : "Start your first Relay project"}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/82">
            {currentProject
              ? currentProject.description || "Relay is ready to keep this project moving between tools."
              : "Once you sign in, the dashboard becomes the review point for captured sessions, pinned memory, and handoff packets."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <div className="rounded-full bg-white/12 px-4 py-2 text-sm text-white/84">{projects.length} projects</div>
            <div className="rounded-full bg-white/12 px-4 py-2 text-sm text-white/84">{dashboard?.recentSessions.length ?? 0} recent captures</div>
            <div className="rounded-full bg-white/12 px-4 py-2 text-sm text-white/84">{pinnedMemory.length} pinned items</div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[30px] border border-[var(--relay-line)] bg-white/84 p-6 shadow-[var(--relay-shadow)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Next action</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">
              {currentProject ? "Connect the extension and keep capturing." : "Connect Chrome before your first handoff."}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
              Create an extension token in settings, paste it into the popup once, then pick the project you want Relay to track.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/settings">Open settings</Link>
              </Button>
              {currentProject ? (
                <Button asChild variant="secondary">
                  <Link href={`/projects/${currentProject.id}`}>Open project</Link>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="rounded-[30px] border border-[var(--relay-line)] bg-[#eef5ea] p-6 shadow-[var(--relay-shadow)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">What Relay keeps nearby</p>
            <div className="mt-4 grid gap-3">
              {["Recent captures", "Pinned decisions and constraints", "Latest context packet"].map((item) => (
                <div key={item} className="rounded-[20px] bg-white/80 px-4 py-3 text-sm font-medium text-[var(--relay-ink)]">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Projects</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Everything currently in motion</h2>
            </div>
            <Link className="text-sm font-medium text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]" href="/settings">
              Connect extension
            </Link>
          </div>
          <ProjectGrid projects={projects} />
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Latest handoff</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Ready to drop into the next tool</h2>
          </div>
          <PacketList packets={dashboard?.packets.slice(0, 1) ?? []} />
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent captures</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">What Relay saw last</h2>
          </div>
          <SessionList sessions={dashboard?.recentSessions ?? []} />
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Pinned memory</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">The pieces worth carrying forward</h2>
          </div>
          <MemoryList items={pinnedMemory.length > 0 ? pinnedMemory : dashboard?.memory.slice(0, 4) ?? []} />
        </div>
      </section>
    </AppShell>
  )
}
