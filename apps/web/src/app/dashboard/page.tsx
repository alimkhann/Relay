import Link from "next/link"
import type { ProjectStateStatusDto } from "@relay/shared"

import { DigestList } from "@/components/digests/digest-list"
import { AppShell } from "@/components/layout/app-shell"
import { PacketList } from "@/components/context/packet-list"
import { CreateProjectForm } from "@/components/projects/create-project-form"
import { ProjectGrid } from "@/components/projects/project-grid"
import { SessionList } from "@/components/sessions/session-list"
import { Button } from "@/components/ui/button"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser, listProjectsForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

function lineItems(items: string[]) {
  return items.length > 0 ? items : ["Nothing durable has been promoted yet."]
}

function describeStateStatus(status: ProjectStateStatusDto | undefined) {
  if (!status) return "Relay is waiting for the first meaningful capture."
  if (status.projectStateReady) return "Project state is ready for the next fresh chat."
  if (status.digestStatus === "running" || status.digestStatus === "pending") {
    return "Relay has raw captures and is currently compressing them into project state."
  }
  if (status.digestStatus === "timed_out") {
    return "A digest timed out and Relay is waiting to retry it."
  }
  if (status.digestStatus === "failed") {
    return status.digestErrorMessage ?? "The latest digest failed and needs another capture attempt."
  }

  return status.rawCapturePresent ? "Relay has raw captures but no durable state yet." : "Relay is waiting for the first meaningful capture."
}

export default async function DashboardPage() {
  const viewer = await requireSessionViewer()
  const projects = await listProjectsForUser(viewer.userId)
  const currentProject = projects[0] ?? null
  const dashboard = currentProject ? await getProjectDashboardForUser(viewer.userId, currentProject.id) : null

  return (
    <AppShell>
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="overflow-hidden rounded-[24px] border border-[var(--relay-line)] bg-[#151713] text-white">
          <div className="grid gap-10 p-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/54">Dashboard</p>
              <h1 className="mt-4 max-w-md text-5xl font-semibold tracking-[-0.055em]">
                {currentProject ? currentProject.name : "Keep the next chat ready before you need it."}
              </h1>
            </div>
            <div className="space-y-4 text-sm leading-7 text-white/72">
              <p>
                {dashboard?.projectState?.projectOverview ??
                  currentProject?.description ??
                  "Relay watches for meaningful project changes, compresses them into state, and keeps a fresh bootstrap ready for the next AI session."}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  [`${projects.length}`, "projects"],
                  [`${dashboard?.recentDigests.length ?? 0}`, "digests"],
                  [`${dashboard?.packets.length ?? 0}`, "bootstraps"]
                ].map(([value, label]) => (
                  <div key={label} className="rounded-[16px] border border-white/8 bg-white/4 px-4 py-4">
                    <p className="text-2xl font-semibold text-white">{value}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/52">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[24px] border border-[var(--relay-line)] bg-white/82 p-6 shadow-[var(--relay-shadow)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Current state</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">
              {dashboard?.projectState?.currentObjective ?? "No current objective captured yet"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
              {dashboard?.projectState?.recentProgress ??
                "Once Relay captures and digests a meaningful session, recent progress and open tasks appear here instead of raw transcripts."}
            </p>
            <div className="mt-5 rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-panel)]/70 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-muted)]">Pipeline status</p>
              <p className="mt-2 text-sm leading-7 text-[var(--relay-ink)]">{describeStateStatus(dashboard?.stateStatus)}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--relay-line)] bg-[var(--relay-background)] p-6 shadow-[var(--relay-shadow)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Connect the extension</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Pair Chrome once, then let Relay stay hidden.</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
              Open the Relay sidepanel in Chrome and use the built-in connect action. The browser now receives its device token behind the scenes.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/settings">Open settings</Link>
              </Button>
              {currentProject ? (
                <Button variant="secondary" asChild>
                  <Link href={`/projects/${currentProject.id}`}>Open project</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {!currentProject ? (
        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">First step</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Create the project Relay should carry forward</h2>
          </div>
          <CreateProjectForm />
        </section>
      ) : (
        <section className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Project memory</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">What should survive the next reset</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[20px] border border-[var(--relay-line)] bg-white/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">Decisions</p>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--relay-muted)]">
                  {lineItems(dashboard?.projectState?.decisions ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[20px] border border-[var(--relay-line)] bg-white/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">Open tasks</p>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--relay-muted)]">
                  {lineItems(dashboard?.projectState?.openTasks ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Latest bootstrap</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">The next clean handoff</h2>
            </div>
            <PacketList packets={dashboard?.packets.slice(0, 1) ?? []} />
          </div>
        </section>
      )}

      <section className="grid gap-8 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent digests</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Compressed state, not transcript clutter</h2>
          </div>
          <DigestList digests={dashboard?.recentDigests ?? []} />
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent captures</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">What Relay has seen lately</h2>
          </div>
          <SessionList sessions={dashboard?.recentSessions ?? []} />
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Projects</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Everything Relay is keeping alive</h2>
          </div>
        </div>
        <ProjectGrid projects={projects} />
      </section>
    </AppShell>
  )
}
