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

function describeStateStatus(status: ProjectStateStatusDto | undefined) {
  if (!status) return "Relay is waiting for the first meaningful chat."
  if (status.projectStateReady) return "Ready for next fresh chat"
  if (status.digestStatus === "running" || status.digestStatus === "pending") return "Updating your project brief"
  if (status.digestStatus === "timed_out") return "Relay is retrying the latest update"
  if (status.digestStatus === "failed") return status.digestErrorMessage ?? "Relay needs another chat before the brief is ready"
  return status.rawCapturePresent ? "Recent chats are saved and Relay is preparing the brief" : "Relay is waiting for the first meaningful chat"
}

export default async function DashboardPage() {
  const viewer = await requireSessionViewer()
  const projects = await listProjectsForUser(viewer.userId)
  const currentProject = projects[0] ?? null
  const dashboard = currentProject ? await getProjectDashboardForUser(viewer.userId, currentProject.id) : null
  const savedContextGroups = [
    { title: "Decisions", items: dashboard?.projectState?.decisions ?? [] },
    { title: "Constraints", items: dashboard?.projectState?.constraints ?? [] },
    { title: "Open tasks", items: dashboard?.projectState?.openTasks ?? [] }
  ].filter((group) => group.items.length > 0)

  return (
    <AppShell>
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="overflow-hidden rounded-[24px] border border-[var(--relay-line)] bg-[#151713] p-8 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/54">Dashboard</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-[-0.055em]">Project context first. Review everything else second.</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/74">
            Relay keeps the sidepanel and inline chip focused on one-click insertion. The web app stays review-oriented: your projects, the latest brief, saved project context, and recent chats.
          </p>
        </div>

        <div className="rounded-[24px] border border-[var(--relay-line)] bg-white/82 p-6 shadow-[var(--relay-shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Connect Relay in Chrome</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Install once, sign in once, and let Relay stay mostly invisible.</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
            Relay works best when it can quietly capture useful chats and insert a ready project brief the next time you start fresh.
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
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Projects</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Pick the project you want Relay to keep ready</h2>
        </div>
        <ProjectGrid projects={projects} />
      </section>

      {!currentProject ? (
        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">First step</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Create the first project Relay should carry forward</h2>
          </div>
          <CreateProjectForm />
        </section>
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
            <div className="rounded-[24px] border border-[var(--relay-line)] bg-white/84 p-6 shadow-[var(--relay-shadow)]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Where this project stands</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">{currentProject.name}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
                {dashboard?.projectState?.projectOverview ?? currentProject.description ?? "Add a short description so Relay can explain the project clearly in fresh chats."}
              </p>
              <div className="mt-5 rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-panel)]/70 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-muted)]">Current objective</p>
                <p className="mt-2 text-sm leading-7 text-[var(--relay-ink)]">
                  {dashboard?.projectState?.currentObjective ?? "No current objective yet. Relay will promote it after the next meaningful chat."}
                </p>
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-muted)]">{describeStateStatus(dashboard?.stateStatus)}</p>
            </div>

            <div className="rounded-[24px] border border-[var(--relay-line)] bg-white/82 p-6 shadow-[var(--relay-shadow)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Latest project brief</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">What the next fresh chat will receive</h2>
                </div>
                <Button asChild variant="secondary">
                  <Link href={`/projects/${currentProject.id}`}>Open full brief</Link>
                </Button>
              </div>
              <div className="mt-5">
                <PacketList packets={dashboard?.packets.slice(0, 1) ?? []} />
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Saved project context</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">The parts that should survive the reset</h2>
            </div>

            {savedContextGroups.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {savedContextGroups.map((group) => (
                  <div key={group.title} className="rounded-[20px] border border-[var(--relay-line)] bg-white/80 p-5 shadow-[var(--relay-shadow)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">{group.title}</p>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--relay-muted)]">
                      {group.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[var(--relay-line)] bg-white/74 p-5 text-sm leading-7 text-[var(--relay-muted)]">
                Saved project context will appear here as Relay learns decisions, constraints, and next steps.
              </div>
            )}
          </section>

          <section className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">What Relay learned</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Useful updates from recent work</h2>
              </div>
              <DigestList digests={dashboard?.recentDigests ?? []} />
            </div>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent chats</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">The latest sessions Relay drew from</h2>
              </div>
              <SessionList sessions={dashboard?.recentSessions ?? []} />
            </div>
          </section>
        </>
      )}
    </AppShell>
  )
}
