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
        <section className="py-10 max-w-2xl">
          <header className="mb-10 space-y-2">
            <h1 className="text-[28px] font-medium tracking-tight text-[var(--relay-ink)]">
              Welcome to Relay
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--relay-muted)]">
              Relay provides reliable, context-aware memory for your AI tools. Start by defining a project boundary.
            </p>
          </header>
          <CreateProjectForm />
        </section>
      ) : (
        <div className="flex flex-col gap-12 pt-6">
          {/* ─── Project header ─── */}
          <section className="flex flex-col items-start gap-4">
            <ProjectPicker
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
              currentId={currentProject.id}
            />
            <p className="text-[15px] font-normal leading-relaxed text-[var(--relay-muted)] max-w-3xl">
              {dashboard?.projectState?.projectOverview ??
                currentProject.description ??
                "Add a project description to help Relay explain your work."}
            </p>
            <div className="mt-1">
              <Button asChild variant="secondary" size="sm" className="rounded-[var(--relay-radius-sm)] shadow-none font-medium h-8 bg-[var(--relay-soft)] text-[var(--relay-ink)] hover:bg-[var(--relay-soft-hover)] border border-[var(--relay-line)]">
                <Link href={`/projects/${currentProject.id}`}>Edit configuration</Link>
              </Button>
            </div>
          </section>

          <div className="space-y-12">
            {/* ─── Status ─── */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-[var(--relay-ink)] tracking-wide uppercase opacity-70 border-b border-[var(--relay-line)] pb-3 mb-1">State Context</h2>
              <div className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    statusReady
                      ? "bg-[var(--relay-success)]"
                      : "bg-[var(--relay-warning)]"
                  }`}
                />
                <span className="text-[14px] text-[var(--relay-ink-secondary)]">{statusText}</span>
              </div>
              {dashboard?.projectState?.currentObjective && (
                <div className="mt-3 text-[14px] leading-relaxed text-[var(--relay-ink-secondary)] bg-[var(--relay-soft)] p-4 rounded-[var(--relay-radius-sm)]">
                  <span className="font-medium text-[var(--relay-ink)] block mb-1">Current Objective</span>
                  {dashboard.projectState.currentObjective}
                </div>
              )}
            </section>

            {dashboard ? (
              <ProjectGovernancePanel
                dashboard={dashboard}
                projectId={currentProject.id}
              />
            ) : null}
          </div>
        </div>
      )}
    </AppShell>
  );
}
