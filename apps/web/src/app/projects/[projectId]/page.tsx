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

function stateList(items: string[]) {
  return items.length > 0 ? items : ["Nothing durable recorded yet."]
}

function describeStateStatus(
  status: {
    digestStatus: "idle" | "pending" | "running" | "completed" | "failed" | "timed_out"
    projectStateReady: boolean
    rawCapturePresent: boolean
    digestErrorMessage: string | null
  }
) {
  if (status.projectStateReady) return "Project state is ready."
  if (status.digestStatus === "running" || status.digestStatus === "pending") return "Digest in progress."
  if (status.digestStatus === "timed_out") return "Digest timed out and will be retried."
  if (status.digestStatus === "failed") return status.digestErrorMessage ?? "Latest digest failed."
  return status.rawCapturePresent ? "Raw captures exist, but durable state is not ready yet." : "No meaningful captures yet."
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const viewer = await requireSessionViewer()
  const { projectId } = await params
  const dashboard = await getProjectDashboardForUser(viewer.userId, projectId)

  if (!dashboard) {
    notFound()
  }

  return (
    <AppShell>
      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[24px] border border-[var(--relay-line)] bg-[#171915] p-8 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/54">Project</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em]">{dashboard.project.name}</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/76">
            {dashboard.projectState?.projectOverview ?? dashboard.project.description ?? "This project has not been summarized yet."}
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
            {dashboard.projectState?.currentObjective ?? "No current objective has been promoted yet."}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--relay-muted)]">
            {dashboard.projectState?.recentProgress ?? "Recent progress will appear here after Relay digests the next meaningful session."}
          </p>
          <div className="mt-5 rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-panel)]/70 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--relay-muted)]">Pipeline status</p>
            <p className="mt-2 text-sm leading-7 text-[var(--relay-ink)]">{describeStateStatus(dashboard.stateStatus)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {([
          ["Decisions", dashboard.projectState?.decisions ?? []],
          ["Constraints", dashboard.projectState?.constraints ?? []],
          ["Open tasks", dashboard.projectState?.openTasks ?? []]
        ] as Array<[string, string[]]>).map(([label, items]) => (
          <div key={label} className="rounded-[20px] border border-[var(--relay-line)] bg-white/78 p-5 shadow-[var(--relay-shadow)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">{label}</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--relay-muted)]">
              {stateList(items as string[]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="grid gap-8 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent digests</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">What Relay promoted into state</h2>
          </div>
          <DigestList digests={dashboard.recentDigests} />
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Latest bootstrap packet</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">The handoff ready for the next chat</h2>
          </div>
          <PacketList packets={dashboard.packets.slice(0, 2)} />
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Recent captures</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Source sessions that shaped this project</h2>
        </div>
        <SessionList sessions={dashboard.recentSessions} />
      </section>
    </AppShell>
  )
}
