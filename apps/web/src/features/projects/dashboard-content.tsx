"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDashboardDto } from "@relay/shared";
import { getProjectContextCounts } from "@relay/shared/utils/project-context";
import { Pencil, Trash2, MoreHorizontal, HelpCircle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useProjectDashboard } from "@/features/projects/use-project-dashboard";
import { queryKeys } from "@/lib/query/keys";
import { DashboardStats } from "@/features/projects/dashboard-stats";
import { DashboardAnalyticsBar } from "@/features/projects/dashboard-analytics-bar";
import { DashboardMemoryCard } from "@/features/projects/dashboard-memory-card";
import { PersonalCategorySummary } from "@/features/projects/personal-category-summary";
import { DashboardBriefCard } from "@/features/projects/dashboard-brief-card";
import { DashboardActivityCard } from "@/features/projects/dashboard-activity-card";
import { DashboardGovernanceSummary } from "@/features/projects/dashboard-governance-summary";
import { MemoryGraphContainer } from "@/features/graph/memory-graph-container";
import { MIN_GRAPH_ITEMS } from "@/features/graph/memory-graph-utils";
import { WalkthroughModal } from "@/components/onboarding/walkthrough-modal";
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
  sessions: ProjectDashboardDto["sessionHistory"],
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
  project: { id: string; name: string; description?: string | null; projectUrl?: string | null; kind?: "project" | "personal" };
  walkthroughInitiallyOpen?: boolean;
  walkthroughInitialStep?: number;
}

export function DashboardContent({ project, walkthroughInitiallyOpen = false, walkthroughInitialStep = 0 }: DashboardContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: dashboard, isPending } = useProjectDashboard(project.id);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(walkthroughInitiallyOpen);
  const [scanPending, setScanPending] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.name);
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState(
    project.description ?? "",
  );
  const [projectUrlDraft, setProjectUrlDraft] = useState(project.projectUrl ?? "");
  const [projectMeta, setProjectMeta] = useState({
    name: project.name,
    description: project.description ?? "",
    projectUrl: project.projectUrl ?? "",
  });
  useEffect(() => {
    setProjectMeta({
      name: project.name,
      description: project.description ?? "",
      projectUrl: project.projectUrl ?? "",
    });
    setProjectNameDraft(project.name);
    setProjectDescriptionDraft(project.description ?? "");
    setProjectUrlDraft(project.projectUrl ?? "");
    setEditDialogOpen(false);
  }, [
    project.id,
    project.name,
    project.description,
    project.projectUrl,
  ]);

  const totalContextItems = dashboard ? getProjectContextCounts(dashboard).all : 0;

  const totalChats = dashboard?.distinctConversationCount ?? 0;
  const latestPacket = dashboard?.packets[0];

  const briefStatus = latestPacket ? "ready" as const : "none" as const;
  const briefGeneratedAt = latestPacket
    ? (dashboard?.packets[0]?.createdAt ?? null)
    : null;

  const groupedSessions = dashboard
    ? groupSessionsByConversation(dashboard.sessionHistory)
    : [];

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

  if (!dashboard) {
    if (isPending) {
      return (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-80" />
            </div>
            <Skeleton className="h-7 w-20" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-24 w-full rounded-[var(--relay-radius)]" />
            <Skeleton className="h-24 w-full rounded-[var(--relay-radius)]" />
            <Skeleton className="h-24 w-full rounded-[var(--relay-radius)]" />
          </div>
          <Skeleton className="h-12 w-full rounded-[var(--relay-radius)]" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Skeleton className="h-40 w-full rounded-[var(--relay-radius)]" />
            <Skeleton className="h-40 w-full rounded-[var(--relay-radius)]" />
          </div>
          <Skeleton className="h-48 w-full rounded-[var(--relay-radius)]" />
        </div>
      );
    }
    return (
      <EmptyState
        title="No data yet"
        description="Your dashboard fills in after your first chat capture."
        className="py-12"
      />
    );
  }

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
          await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(project.id) });
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
    const nextProjectUrl = projectUrlDraft.trim();

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
      nextDescription === projectMeta.description &&
      nextProjectUrl === projectMeta.projectUrl
    ) {
      setEditDialogOpen(false);
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
            projectUrl: nextProjectUrl || null,
          }),
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Project update failed.");
        }

        const payload = (await res.json()) as {
          project: { name: string; description: string | null; projectUrl: string | null };
        };

        setProjectMeta({
          name: payload.project.name,
          description: payload.project.description ?? "",
          projectUrl: payload.project.projectUrl ?? "",
        });
        setProjectNameDraft(payload.project.name);
        setProjectDescriptionDraft(payload.project.description ?? "");
        setProjectUrlDraft(payload.project.projectUrl ?? "");
        setEditDialogOpen(false);
      },
      "Saving project…",
      "Project updated.",
    );
  }

  async function scanProjectUrl() {
    const url = projectUrlDraft.trim();
    if (!url) {
      setStatus("Enter a project URL to scan.");
      return;
    }

    setScanPending(true);
    setStatus("Scanning project URL…");
    try {
      const response = await relayClientFetch("/api/projects/scan-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "URL scan failed.");
      }

      const result = (await response.json()) as {
        name: string | null;
        description: string | null;
        url: string;
      };

      setProjectUrlDraft(result.url);
      if (!projectNameDraft.trim() && result.name) setProjectNameDraft(result.name);
      if (!projectDescriptionDraft.trim() && result.description) {
        setProjectDescriptionDraft(result.description);
      }
      setStatus("Project URL scanned.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "URL scan failed.");
    } finally {
      setScanPending(false);
    }
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
            <h1 className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
              {projectMeta.name}
            </h1>
            {projectMeta.description ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--relay-muted)] max-w-2xl">
                {projectMeta.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Tooltip content="Guide">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Open guide"
                className="h-7 w-7 p-0 text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
                onClick={() => setWalkthroughOpen(true)}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Edit project">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Edit project"
                className="h-7 w-7 p-0 text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
                onClick={() => setEditDialogOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </Tooltip>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Project actions"
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
                    onSelect={() => setEditDialogOpen(true)}
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

      {/* ─── Graph minimap ─── */}
      {dashboard.memory.length >= MIN_GRAPH_ITEMS && (
        <FadeIn delay={0.06}>
          <MemoryGraphContainer
            projectId={project.id}
            projectName={project.name}
            memoryItems={dashboard.memory}
          />
        </FadeIn>
      )}

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
          {project.kind === "personal" ? (
            <PersonalCategorySummary projectId={project.id} memory={dashboard.memory} />
          ) : (
            <DashboardMemoryCard
              projectId={project.id}
              overview={dashboard.projectState?.projectOverview ?? project.description ?? ""}
              objective={dashboard.projectState?.currentObjective ?? ""}
              progress={dashboard.projectState?.recentProgress ?? ""}
            />
          )}
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

      {/* ─── Edit project dialog ─── */}
      <Dialog.Root open={editDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setProjectNameDraft(projectMeta.name);
          setProjectDescriptionDraft(projectMeta.description);
          setProjectUrlDraft(projectMeta.projectUrl);
        }
        setEditDialogOpen(open);
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6 shadow-[var(--relay-shadow-lg)]">
            <Dialog.Title className="text-[15px] font-semibold text-[var(--relay-ink)]">
              Edit project
            </Dialog.Title>
            <div className="mt-4 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[13px] font-medium text-[var(--relay-ink)]">Name</span>
                <input
                  className="w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 py-2 text-[13px] text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
                  value={projectNameDraft}
                  onChange={(e) => setProjectNameDraft(e.target.value)}
                  maxLength={80}
                  disabled={pending}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveProjectMetadata();
                    if (e.key === "Escape") setEditDialogOpen(false);
                  }}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[13px] font-medium flex items-baseline gap-2">
                  <span className="text-[var(--relay-ink)]">Project URL</span>
                  <span className="text-xs text-[var(--relay-muted)] font-normal">Optional</span>
                </span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 py-2 text-[13px] text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
                    value={projectUrlDraft}
                    onChange={(e) => setProjectUrlDraft(e.target.value)}
                    placeholder="https://example.com"
                    type="url"
                    disabled={pending || scanPending}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending || scanPending || !projectUrlDraft.trim()}
                    onClick={() => void scanProjectUrl()}
                    className="h-9 text-[12px] sm:w-auto"
                  >
                    {scanPending ? "Scanning…" : "Scan"}
                  </Button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-[13px] font-medium flex items-baseline gap-2">
                  <span className="text-[var(--relay-ink)]">Description</span>
                  <span className="text-xs text-[var(--relay-muted)] font-normal">Optional</span>
                </span>
                <textarea
                  className="w-full min-h-[80px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 py-2 text-[13px] leading-relaxed text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)] resize-y"
                  value={projectDescriptionDraft}
                  onChange={(e) => setProjectDescriptionDraft(e.target.value)}
                  placeholder="Describe the project so Relay can associate the right chats."
                  maxLength={200}
                  disabled={pending}
                />
                <div className="flex justify-end">
                  <span className="text-[11px] text-[var(--relay-muted)] tabular-nums">{projectDescriptionDraft.length}/200</span>
                </div>
              </label>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setEditDialogOpen(false)}
                className="h-8 text-[12px]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={saveProjectMetadata}
                className="h-8 text-[12px]"
              >
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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

      <WalkthroughModal
        open={walkthroughOpen}
        onOpenChange={setWalkthroughOpen}
        surface="web"
        initialStep={walkthroughInitialStep}
      />
    </div>
  );
}
