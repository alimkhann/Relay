import Link from "next/link"
import { notFound } from "next/navigation"

import { DigestList } from "@/components/digests/digest-list"
import { AppShell } from "@/components/layout/app-shell"
import { PacketList } from "@/components/context/packet-list"
import { SessionList } from "@/components/sessions/session-list"
import { Button } from "@/components/ui/button"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

function describeStateStatus(
  status: {
    digestStatus: "idle" | "pending" | "running" | "completed" | "failed" | "timed_out"
    projectStateReady: boolean
    rawCapturePresent: boolean
    digestErrorMessage: string | null
  }
) {
  if (status.projectStateReady) return "Ready for next fresh chat"
  if (status.digestStatus === "running" || status.digestStatus === "pending") return "Updating your project brief"
  if (status.digestStatus === "timed_out") return "Relay is retrying the latest update"
  if (status.digestStatus === "failed") return status.digestErrorMessage ?? "Relay needs another recent chat before the brief is ready"
  return status.rawCapturePresent ? "Recent chats are saved and Relay is preparing the brief" : "Relay is waiting for the first meaningful chat"
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const viewer = await requireSessionViewer()
  const { projectId } = await params
  const dashboard = await getProjectDashboardForUser(viewer.userId, projectId)

  if (!dashboard) {
    notFound()
  }

  const contextGroups = [
    { title: "Decisions", items: dashboard.projectState?.decisions ?? [] },
    { title: "Constraints", items: dashboard.projectState?.constraints ?? [] },
    { title: "Open tasks", items: dashboard.projectState?.openTasks ?? [] }
  ].filter((group) => group.items.length > 0)

  return (
    <AppShell>
      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[24px] border border-[var(--relay-line)] bg-[#171915] p-8 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/54">About this project</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em]">{dashboard.project.name}</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/76">
            {dashboard.projectState?.projectOverview ?? dashboard.project.description ?? "Add a one-line project description so Relay can introduce this work cleanly in fresh chats."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild>
              <Link href="/settings">Settings</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--relay-line)] bg-white/82 p-6 shadow-[var(--relay-shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Current objective</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">
            {dashboard.projectState?.currentObjective ?? "Relay has not promoted a current objective yet."}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--relay-muted)]">
            {dashboard.projectState?.recentProgress ?? "Recent progress will appear here after Relay learns from a meaningful chat."}
          </p>
          <div className="mt-5 rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-panel)]/70 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-muted)]">Project status</p>
            <p className="mt-2 text-sm leading-7 text-[var(--relay-ink)]">{describeStateStatus(dashboard.stateStatus)}</p>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Saved project context</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Decisions, constraints, and next steps that matter</h2>
        </div>

        {contextGroups.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {contextGroups.map((group) => (
              <div key={group.title} className="rounded-[20px] border border-[var(--relay-line)] bg-white/78 p-5 shadow-[var(--relay-shadow)]">
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
            Relay will add saved project context here after the next meaningful chat or saved snippet.
          </div>
        )}
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Latest project brief</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">What a fresh chat will receive right now</h2>
          </div>
          <PacketList packets={dashboard.packets.slice(0, 2)} />
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">What Relay learned</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Useful updates from recent work</h2>
          </div>
          <DigestList digests={dashboard.recentDigests} />
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent chats</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">The latest sessions that shaped this project</h2>
        </div>
        <SessionList sessions={dashboard.recentSessions} />
      </section>
    </AppShell>
  )
}
