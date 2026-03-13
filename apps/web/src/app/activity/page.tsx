import type { ProjectDashboardDto } from "@relay/shared";

import { AppShell } from "@/components/layout/app-shell";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageViewer } from "@/server/policies/viewer";
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service";

export const dynamic = "force-dynamic";

interface ActivityEntry {
  kind: "capture" | "digest";
  projectName: string;
  title: string;
  detail: string;
  timestamp: string;
}

function buildActivityFeed(
  projects: { id: string; name: string }[],
  dashboards: (ProjectDashboardDto | null)[],
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  dashboards.forEach((dashboard, i) => {
    if (!dashboard) return;
    const project = projects[i];
    if (!project) return;
    const projectName = project.name;

    for (const session of dashboard.sessionHistory) {
      entries.push({
        kind: "capture",
        projectName,
        title: session.title ?? session.url,
        detail: `${session.platform} · ${session.turnCount} turns${session.isArchived ? " · detached" : ""}`,
        timestamp: session.capturedAt ?? "",
      });
    }

    for (const digest of dashboard.recentDigests) {
      entries.push({
        kind: "digest",
        projectName,
        title: digest.summaryShort ?? "Digest run",
        detail: `confidence ${Math.round((digest.confidence ?? 0) * 100)}%${digest.shouldMerge ? " · merged" : ""}`,
        timestamp: digest.createdAt ?? "",
      });
    }
  });

  entries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  return entries.slice(0, 50);
}

function formatRelativeTime(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ActivityPage() {
  const viewer = await requirePageViewer("/activity");
  const projects = await listProjectsForUser(viewer.userId);

  const dashboards = await Promise.all(
    projects.map((p) => getProjectDashboardForUser(viewer.userId, p.id)),
  );

  const feed = buildActivityFeed(projects, dashboards);

  return (
    <AppShell>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="activity.viewed"
        message="Rendered the activity page."
      />

      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Activity
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Recent captures and digest runs across all projects.
          </p>
        </div>

        {feed.length === 0 ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <EmptyState
              title="No activity yet"
              description="Activity will appear here after Relay captures chats or runs digests."
            />
          </div>
        ) : (
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="divide-y divide-[var(--relay-line)]">
              {feed.map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${i}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--relay-soft)]/50 transition-colors"
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      background:
                        entry.kind === "capture"
                          ? "var(--relay-section-decision)"
                          : "var(--relay-section-task)",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[var(--relay-muted)] uppercase tracking-wider">
                        {entry.projectName}
                      </span>
                      <span className="text-[10px] text-[var(--relay-faint)]">
                        {entry.kind === "capture" ? "Capture" : "Digest"}
                      </span>
                    </div>
                    <p className="truncate text-[13px] text-[var(--relay-ink)]">
                      {entry.title}
                    </p>
                    <p className="text-[11px] text-[var(--relay-muted)]">
                      {entry.detail}
                    </p>
                  </div>
                  <span className="text-[11px] text-[var(--relay-faint)] shrink-0 tabular-nums">
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
