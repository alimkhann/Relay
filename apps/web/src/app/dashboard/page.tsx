import Link from "next/link";
import type { ProjectStateStatusDto } from "@relay/shared";

import { AppShell } from "@/components/layout/app-shell";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectPicker } from "@/components/projects/project-picker";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { Button } from "@/components/ui/button";
import { ProjectGovernancePanel } from "@/features/projects/project-governance-panel";
import { logServerEvent } from "@/server/logging/logger";
import { requirePageViewer } from "@/server/policies/viewer";
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service";

export const dynamic = "force-dynamic";

function describeStatus(status: ProjectStateStatusDto | undefined) {
  if (!status) return "Waiting for the first chat.";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const viewer = await requirePageViewer("/dashboard");
  const projects = await listProjectsForUser(viewer.userId);
  const { project: selectedProjectId } = await searchParams;
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : projects[0]) ??
    projects[0] ??
    null;
  const dashboard = currentProject
    ? await getProjectDashboardForUser(viewer.userId, currentProject.id)
    : null;

  const statusReady = dashboard?.stateStatus?.projectStateReady;
  const statusText = describeStatus(dashboard?.stateStatus);

  if (!currentProject) {
    await logServerEvent({
      level: "info",
      surface: "web-dashboard",
      area: "onboarding",
      event: "dashboard.empty_state",
      message: "Rendered the dashboard empty state for a user with no projects.",
      userId: viewer.userId,
    });
  }

  return (
    <AppShell>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="dashboard.viewed"
        message="Rendered the dashboard."
        context={{
          hasProject: Boolean(currentProject),
          projectId: currentProject?.id ?? null,
        }}
      />
      {/* ─── First-run: no projects ─── */}
      {!currentProject ? (
        <section className="mx-auto max-w-lg py-12">
          <h1 className="text-2xl font-bold tracking-tight">
            Create your first project
          </h1>
          <p className="mt-2 text-sm text-[var(--relay-muted)]">
            Relay keeps a project brief ready so you never re-explain from
            scratch.
          </p>
          <div className="mt-8">
            <CreateProjectForm />
          </div>
        </section>
      ) : (
        <>
          {/* ─── Project header ─── */}
          <section className="flex items-start justify-between gap-4">
            <div>
              <ProjectPicker
                projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                currentId={currentProject.id}
              />
              <p className="mt-1 text-sm text-[var(--relay-muted)]">
                {dashboard?.projectState?.projectOverview ??
                  currentProject.description ??
                  "Add a project description to help Relay explain your work."}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/projects/${currentProject.id}`}>View project</Link>
            </Button>
          </section>

          {/* ─── Status + Objective ─── */}
          <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 shadow-[var(--relay-shadow-sm)]">
            <div className="flex items-center gap-3">
              <span
                className={`h-2 w-2 rounded-full ${
                  statusReady
                    ? "bg-[var(--relay-success)]"
                    : "bg-[var(--relay-warning)]"
                }`}
              />
              <span className="text-sm font-medium">{statusText}</span>
            </div>
            {dashboard?.projectState?.currentObjective ? (
              <div className="mt-4 border-t border-[var(--relay-line)] pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--relay-faint)]">
                  Current objective
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--relay-ink-secondary)]">
                  {dashboard.projectState.currentObjective}
                </p>
              </div>
            ) : null}
          </section>

          {dashboard ? (
            <ProjectGovernancePanel
              dashboard={dashboard}
              projectId={currentProject.id}
            />
          ) : null}
        </>
      )}
    </AppShell>
  );
}
