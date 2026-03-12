import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { PacketList } from "@/components/context/packet-list";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Button } from "@/components/ui/button";
import { requireSessionViewer } from "@/server/policies/viewer";
import { getProjectDashboardForUser } from "@/server/services/project-service";

export const dynamic = "force-dynamic";

function describeStatus(status: {
  digestStatus:
    | "idle"
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "timed_out";
  projectStateReady: boolean;
  rawCapturePresent: boolean;
  digestErrorMessage: string | null;
}) {
  if (status.projectStateReady) return "Ready for next chat";
  if (status.digestStatus === "running" || status.digestStatus === "pending")
    return "Updating brief…";
  if (status.digestStatus === "timed_out") return "Retrying update…";
  if (status.digestStatus === "failed")
    return status.digestErrorMessage ?? "Needs another chat";
  return status.rawCapturePresent
    ? "Preparing brief…"
    : "Waiting for the first chat.";
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const viewer = await requireSessionViewer();
  const { projectId } = await params;
  const dashboard = await getProjectDashboardForUser(viewer.userId, projectId);

  if (!dashboard) {
    notFound();
  }

  const savedContext = [
    ...(dashboard.projectState?.decisions ?? []).map((d) => ({
      type: "Decision" as const,
      text: d,
    })),
    ...(dashboard.projectState?.constraints ?? []).map((c) => ({
      type: "Constraint" as const,
      text: c,
    })),
    ...(dashboard.projectState?.openTasks ?? []).map((t) => ({
      type: "Task" as const,
      text: t,
    })),
  ];

  const statusReady = dashboard.stateStatus.projectStateReady;
  const statusText = describeStatus(dashboard.stateStatus);

  return (
    <AppShell>
      {/* ─── Header ─── */}
      <section>
        <Link
          href="/dashboard"
          className="text-sm text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          {dashboard.project.name}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--relay-muted)]">
          {dashboard.projectState?.projectOverview ??
            dashboard.project.description ??
            "Add a project description to help Relay explain your work."}
        </p>
      </section>

      {/* ─── Status + Objective ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 shadow-[var(--relay-shadow-sm)]">
        <div className="flex items-center gap-3">
          <span
            className={`h-2 w-2 rounded-full ${statusReady ? "bg-[var(--relay-success)]" : "bg-[var(--relay-warning)]"}`}
          />
          <span className="text-sm font-medium">{statusText}</span>
        </div>
        {dashboard.projectState?.currentObjective ? (
          <div className="mt-4 border-t border-[var(--relay-line)] pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--relay-faint)]">
              Current objective
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--relay-ink-secondary)]">
              {dashboard.projectState.currentObjective}
            </p>
          </div>
        ) : null}
        {dashboard.projectState?.recentProgress ? (
          <div className="mt-4 border-t border-[var(--relay-line)] pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--relay-faint)]">
              Recent progress
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--relay-ink-secondary)]">
              {dashboard.projectState.recentProgress}
            </p>
          </div>
        ) : null}
      </section>

      {/* ─── Saved context ─── */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Saved context</h2>
        {savedContext.length > 0 ? (
          <ul className="mt-3 space-y-0.5">
            {savedContext.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-[var(--relay-radius-sm)] px-3 py-2.5 transition hover:bg-[var(--relay-soft)]"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    item.type === "Decision"
                      ? "bg-blue-500"
                      : item.type === "Constraint"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm leading-relaxed text-[var(--relay-ink-secondary)]">
                    {item.text}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-[var(--relay-faint)]">
                  {item.type}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--relay-muted)]">
            Saved context will appear here as Relay learns from your chats.
          </p>
        )}
      </section>

      {/* ─── Project brief ─── */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Project brief</h2>
        <div className="mt-3">
          <PacketList packets={dashboard.packets.slice(0, 2)} />
        </div>
      </section>

      {/* ─── Recent activity ─── */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">
          Recent activity
        </h2>
        <div className="mt-3">
          <ActivityFeed
            sessions={dashboard.recentSessions}
            digests={dashboard.recentDigests}
          />
        </div>
      </section>
    </AppShell>
  );
}
