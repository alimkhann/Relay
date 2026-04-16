"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDashboardDto } from "@relay/shared";
import { getProjectContextCounts } from "@relay/shared/utils/project-context";
import { Pencil, Trash2, MoreHorizontal } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { DashboardStats } from "@/features/projects/dashboard-stats";
import { DashboardAnalyticsBar } from "@/features/projects/dashboard-analytics-bar";
import { DashboardMemoryCard } from "@/features/projects/dashboard-memory-card";
import { DashboardBriefCard } from "@/features/projects/dashboard-brief-card";
import { DashboardActivityCard } from "@/features/projects/dashboard-activity-card";
import { DashboardGovernanceSummary } from "@/features/projects/dashboard-governance-summary";
import { logClientEvent } from "@/lib/telemetry/client";
import { relayClientFetch } from "@/lib/telemetry/fetch";

/* ─── Helpers ─── */

interface GroupedSession {
  conversationId: string;
  platform: string;
  title: string | null;
  url: string;
  captureCount: number;
  totalTurns: number;
  lastCapturedAt: string;
  sessionIds: string[];
  allArchived: boolean;
}

function groupSessionsByConversation(
  sessions: DashboardContentProps["dashboard"]["sessionHistory"],
): GroupedSession[] {
  const groups = new Map<string, GroupedSession>();

  for (const session of sessions) {
    const conversationId = session.sourceConversationId ?? session.url;

    const existing = groups.get(conversationId);
    if (existing) {
      existing.captureCount += 1;
      existing.totalTurns += session.turnCount;
      existing.sessionIds.push(session.id);
      if (session.capturedAt > existing.lastCapturedAt) {
        existing.title = session.title;
        existing.url = session.url;
        existing.lastCapturedAt = session.capturedAt;
      }
      existing.allArchived = existing.allArchived && session.isArchived;
    } else {
      groups.set(conversationId, {
        conversationId,
        platform: session.platform,
        title: session.title,
        url: session.url,
        captureCount: 1,
        totalTurns: session.turnCount,
        lastCapturedAt: session.capturedAt,
        sessionIds: [session.id],
        allArchived: session.isArchived,
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    b.lastCapturedAt > a.lastCapturedAt ? 1 : -1,
  );
}

/* ─── Component ─── */

interface DashboardContentProps {
  project: { id: string; name: string; description?: string | null };
  dashboard: ProjectDashboardDto;
}

export function DashboardContent({ project, dashboard }: DashboardContentProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [editingProject, setEditingProject] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.name);
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState(
    project.description ?? "",
  );
  const [projectMeta, setProjectMeta] = useState({
    name: project.name,
    description: project.description ?? "",
  });
  useEffect(() => {
    setProjectMeta({
      name: project.name,
      description: project.description ?? "",
    });
    setProjectNameDraft(project.name);
    setProjectDescriptionDraft(project.description ?? "");
    setEditingProject(false);
  }, [
    project.id,
    project.name,
    project.description,
  ]);

  const totalContextItems = getProjectContextCounts(dashboard).all;

  const totalChats = dashboard.distinctConversationCount;
  const latestPacket = dashboard.packets[0];

  const briefStatus = latestPacket ? "ready" as const : "none" as const;
  const briefGeneratedAt = latestPacket
    ? (dashboard.packets[0]?.createdAt ?? null)
    : null;

  const groupedSessions = groupSessionsByConversation(dashboard.sessionHistory);

  useEffect(() => {
    logClientEvent({
      level: "info",
      surface: "web-dashboard",
      area: "projects",
      event: "project_opened",
      message: "Opened a project in the dashboard.",
      projectId: project.id,
    });
  }, [project.id]);

  /* ─── Mutations ─── */

  function runMutation(
    action: () => Promise<void>,
    pendingMsg: string,
    doneMsg: string,
  ) {
    startTransition(() => {
      void (async () => {
        setStatus(pendingMsg);
        try {
          await action();
          setStatus(doneMsg);
          router.refresh();
        } catch (cause) {
          setStatus(
            cause instanceof Error ? cause.message : "Request failed.",
          );
        }
      })();
    });
  }

  function saveProjectMetadata() {
    const nextName = projectNameDraft.trim();
    const nextDescription = projectDescriptionDraft.trim();

    if (nextName.length < 2) {
      setStatus("Project name must be at least 2 characters.");
      return;
    }

    if (nextDescription.length > 200) {
      setStatus("Project description must be 200 characters or less.");
      return;
    }

    if (
      nextName === projectMeta.name &&
      nextDescription === projectMeta.description
    ) {
      setEditingProject(false);
      setStatus("No project changes to save.");
      return;
    }

    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: nextName,
            description: nextDescription || null,
          }),
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Project update failed.");
        }

        const payload = (await res.json()) as {
          project: { name: string; description: string | null };
        };

        setProjectMeta({
          name: payload.project.name,
          description: payload.project.description ?? "",
        });
        setProjectNameDraft(payload.project.name);
        setProjectDescriptionDraft(payload.project.description ?? "");
        setEditingProject(false);
      },
      "Saving project…",
      "Project updated.",
    );
  }

  function archiveProject() {
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${project.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Failed to delete project.");
        }
        router.push("/dashboard");
      },
      "Deleting project…",
      "Project deleted.",
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Header strip ─── */}
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingProject ? (
              <div className="space-y-3 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="text-xl font-semibold tracking-tight text-[var(--relay-ink)] bg-transparent border-b-2 border-[var(--relay-accent)] outline-none w-full max-w-md py-0.5"
                    value={projectNameDraft}
                    onChange={(event) =>
                      setProjectNameDraft(event.target.value)
                    }
                    maxLength={80}
                    disabled={pending}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveProjectMetadata();
                      if (e.key === "Escape") {
                        setProjectNameDraft(projectMeta.name);
                        setProjectDescriptionDraft(projectMeta.description);
                        setEditingProject(false);
                      }
                    }}
                  />
                </div>
                <textarea
                  className="w-full min-h-[60px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)] resize-none"
                  value={projectDescriptionDraft}
                  onChange={(event) =>
                    setProjectDescriptionDraft(event.target.value)
                  }
                  placeholder="Describe the project so Relay can associate the right chats."
                  maxLength={200}
                  disabled={pending}
                />
                <motion.div
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={saveProjectMetadata}
                    className="h-7 text-[11px]"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setProjectNameDraft(projectMeta.name);
                      setProjectDescriptionDraft(projectMeta.description);
                      setEditingProject(false);
                    }}
                    className="h-7 text-[11px]"
                  >
                    Cancel
                  </Button>
                  <span className="text-[10px] text-[var(--relay-faint)] ml-auto">
                    {projectDescriptionDraft.length}/200
                  </span>
                </motion.div>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                  {projectMeta.name}
                </h1>
                {projectMeta.description ? (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--relay-muted)] max-w-2xl">
                    {projectMeta.description}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-[140px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-1 shadow-[var(--relay-shadow-lg)]"
                >
                  <DropdownMenu.Item
                    className="flex items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[12px] text-[var(--relay-ink)] outline-none cursor-pointer hover:bg-[var(--relay-soft)]"
                    onSelect={() => setEditingProject(true)}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit project
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[12px] text-red-500 outline-none cursor-pointer hover:bg-red-500/10"
                    onSelect={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete project
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </FadeIn>

      {/* ─── Stats row ─── */}
      <FadeIn delay={0.05}>
        <DashboardStats
          totalChats={totalChats}
          totalContextItems={totalContextItems}
          briefStatus={briefStatus}
          briefGeneratedAt={briefGeneratedAt}
        />
      </FadeIn>

      {/* ─── Analytics bar ─── */}
      <FadeIn delay={0.07}>
        <DashboardAnalyticsBar
          sessions={dashboard.sessionHistory.map((s) => ({
            platform: s.platform,
            capturedAt: s.capturedAt,
          }))}
          digestConfidenceScores={[]}
        />
      </FadeIn>

      {/* ─── 2-column: Memory + Brief ─── */}
      <FadeIn delay={0.1}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <DashboardMemoryCard
            projectId={project.id}
            overview={dashboard.projectState?.projectOverview ?? project.description ?? ""}
            objective={dashboard.projectState?.currentObjective ?? ""}
            progress={dashboard.projectState?.recentProgress ?? ""}
          />
          <DashboardBriefCard
            projectId={project.id}
            packets={dashboard.packets}
          />
        </div>
      </FadeIn>

      {/* ─── Recent Activity ─── */}
      <FadeIn delay={0.15}>
        <DashboardActivityCard
          sessions={groupedSessions.slice(0, 5)}
          totalChats={totalChats}
        />
      </FadeIn>

      {/* ─── Governance summary ─── */}
      <FadeIn delay={0.2}>
        <DashboardGovernanceSummary projectId={project.id} dashboard={dashboard} />
      </FadeIn>

      {/* ─── Delete confirmation dialog ─── */}
      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6 shadow-[var(--relay-shadow-lg)]">
            <Dialog.Title className="text-[15px] font-semibold text-[var(--relay-ink)]">
              Delete {projectMeta.name}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-[var(--relay-muted)]">
              This will remove the project and free up a project slot. This action cannot be undone.
            </Dialog.Description>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteDialogOpen(false)}
                className="h-8 text-[12px]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setDeleteDialogOpen(false);
                  archiveProject();
                }}
                className="h-8 text-[12px] bg-red-600 text-white hover:bg-red-700"
              >
                Delete project
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Status toast */}
      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 mx-4 max-w-[calc(100vw-2rem)] rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
