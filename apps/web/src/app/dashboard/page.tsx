import Link from "next/link"
import type { ProjectStateStatusDto } from "@relay/shared"

import { AppShell } from "@/components/layout/app-shell"
import { PacketList } from "@/components/context/packet-list"
import { CreateProjectForm } from "@/components/projects/create-project-form"
import { ProjectGrid } from "@/components/projects/project-grid"
import { ActivityFeed } from "@/components/activity/activity-feed"
import { Button } from "@/components/ui/button"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser, listProjectsForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

function describeStatus(status: ProjectStateStatusDto | undefined) {
  if (!status) return "Waiting for the first chat."
  if (status.projectStateReady) return "Ready for next chat"
  if (status.digestStatus === "running" || status.digestStatus === "pending") return "Updating brief…"
  if (status.digestStatus === "timed_out") return "Retrying update…"
  if (status.digestStatus === "failed") return status.digestErrorMessage ?? "Needs another chat"
  return status.rawCapturePresent ? "Preparing brief…" : "Waiting for the first chat."
}

export default async function DashboardPage() {
  const viewer = await requireSessionViewer()
  const projects = await listProjectsForUser(viewer.userId)
  const currentProject = projects[0] ?? null
  const dashboard = currentProject ? await getProjectDashboardForUser(viewer.userId, currentProject.id) : null

  const savedContext = [
    ...(dashboard?.projectState?.decisions ?? []).map((d) => ({ type: "Decision" as const, text: d })),
    ...(dashboard?.projectState?.constraints ?? []).map((c) => ({ type: "Constraint" as const, text: c })),
    ...(dashboard?.projectState?.openTasks ?? []).map((t) => ({ type: "Task" as const, text: t }))
  ]

  const statusReady = dashboard?.stateStatus?.projectStateReady
  const statusText = describeStatus(dashboard?.stateStatus)

  return (
    <AppShell>
      {/* ─── First-run: no projects ─── */}
      {!currentProject ? (
        <section className="mx-auto max-w-lg py-12">
          <h1 className="text-2xl font-bold tracking-tight">Create your first project</h1>
          <p className="mt-2 text-sm text-[var(--relay-muted)]">
            Relay keeps a project brief ready so you never re-explain from scratch.
          </p>
          <div className="mt-8">
            <CreateProjectForm />
          </div>
        </section>
      ) : (
        <>
          {/* ─── Project header ─── */}
          <section className="flex flex-col gap-1">
            {projects.length > 1 ? (
              <div className="flex items-center gap-2 text-sm text-[var(--relay-muted)]">
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className={`rounded-[var(--relay-radius-sm)] px-2.5 py-1 transition ${p.id === currentProject.id ? "bg-[var(--relay-soft)] text-[var(--relay-ink)] font-medium" : "hover:bg-[var(--relay-soft)]"}`}
                  >
                    {p.name}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{currentProject.name}</h1>
                <p className="mt-1 text-sm text-[var(--relay-muted)]">
                  {dashboard?.projectState?.projectOverview ?? currentProject.description ?? "Add a project description to help Relay explain your work."}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/projects/${currentProject.id}`}>View project</Link>
              </Button>
            </div>
          </section>

          {/* ─── Status + Objective ─── */}
          <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 shadow-[var(--relay-shadow-sm)]">
            <div className="flex items-center gap-3">
              <span className={`h-2 w-2 rounded-full ${statusReady ? "bg-[var(--relay-success)]" : "bg-[var(--relay-warning)]"}`} />
              <span className="text-sm font-medium">{statusText}</span>
            </div>
            {dashboard?.projectState?.currentObjective ? (
              <div className="mt-4 border-t border-[var(--relay-line)] pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--relay-faint)]">Current objective</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--relay-ink-secondary)]">
                  {dashboard.projectState.currentObjective}
                </p>
              </div>
            ) : null}
          </section>

          {/* ─── Next chat brief ─── */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Next chat brief</h2>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/projects/${currentProject.id}`}>Full brief</Link>
              </Button>
            </div>
            <div className="mt-3">
              <PacketList packets={dashboard?.packets.slice(0, 1) ?? []} />
            </div>
          </section>

          {/* ─── Saved context ─── */}
          <section>
            <h2 className="text-lg font-semibold tracking-tight">Saved context</h2>
            {savedContext.length > 0 ? (
              <ul className="mt-3 space-y-0.5">
                {savedContext.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-[var(--relay-radius-sm)] px-3 py-2.5 transition hover:bg-[var(--relay-soft)]">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.type === "Decision" ? "bg-blue-500" :
                      item.type === "Constraint" ? "bg-amber-500" :
                      "bg-emerald-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm leading-relaxed text-[var(--relay-ink-secondary)]">{item.text}</span>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[var(--relay-faint)]">{item.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--relay-muted)]">
                Saved context will appear here as Relay learns from your chats.
              </p>
            )}
          </section>

          {/* ─── Recent activity ─── */}
          <section>
            <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
            <div className="mt-3">
              <ActivityFeed
                sessions={dashboard?.recentSessions ?? []}
                digests={dashboard?.recentDigests ?? []}
              />
            </div>
          </section>
        </>
      )}
    </AppShell>
  )
}
