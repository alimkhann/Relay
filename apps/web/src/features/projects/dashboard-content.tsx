"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDashboardDto, ProjectStateStatusDto } from "@relay/shared";
import { RefreshCw, Pencil } from "lucide-react";

import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { DashboardStats } from "@/features/projects/dashboard-stats";
import { DashboardAnalyticsBar } from "@/features/projects/dashboard-analytics-bar";
import { DashboardMemoryCard } from "@/features/projects/dashboard-memory-card";
import { DashboardBriefCard } from "@/features/projects/dashboard-brief-card";
import { DashboardActivityCard } from "@/features/projects/dashboard-activity-card";
import { DashboardGovernanceSummary } from "@/features/projects/dashboard-governance-summary";
import { cn } from "@/lib/cn";
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import {
  buildProjectMemoryOverridePatch,
  deriveProjectMemoryDrafts,
} from "@/features/projects/project-memory-state";

/* ─── Helpers ─── */

function describeStatus(status: ProjectStateStatusDto | undefined) {
  if (!status) return "Waiting for the first chat.";
  if (status.projectStateReady) return "Ready";
  if (status.digestStatus === "running" || status.digestStatus === "pending")
    return "Updating…";
  if (status.digestStatus === "timed_out") return "Retrying…";
  if (status.digestStatus === "failed")
    return status.digestErrorMessage ?? "Needs another chat";
  return status.rawCapturePresent ? "Preparing…" : "Waiting for first chat";
}

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
  const [editingMemory, setEditingMemory] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [projectNameDraft, setProjectNameDraft] = useState(project.name);
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState(
    project.description ?? "",
  );
  const [projectMeta, setProjectMeta] = useState({
    name: project.name,
    description: project.description ?? "",
  });
  const initialDrafts = deriveProjectMemoryDrafts({
    dashboard,
    fallbackOverview: project.description,
  });
  const memoryDraftResetKey = JSON.stringify(initialDrafts);
  const [overview, setOverview] = useState(initialDrafts.overview);
  const [objective, setObjective] = useState(initialDrafts.objective);
  const [progress, setProgress] = useState(initialDrafts.progress);

  useEffect(() => {
    setProjectMeta({
      name: project.name,
      description: project.description ?? "",
    });
    setProjectNameDraft(project.name);
    setProjectDescriptionDraft(project.description ?? "");
    setEditingProject(false);
    const nextDrafts = deriveProjectMemoryDrafts({
      dashboard,
      fallbackOverview: project.description,
    });
    setOverview(nextDrafts.overview);
    setObjective(nextDrafts.objective);
    setProgress(nextDrafts.progress);
    setEditingMemory(false);
  }, [
    project.id,
    project.name,
    project.description,
    memoryDraftResetKey,
  ]);

  const statusReady = dashboard.stateStatus?.projectStateReady;
  const statusText = describeStatus(dashboard.stateStatus);

  const sections = ["decision", "task", "constraint"] as const;
  const totalContextItems = sections.reduce((acc, s) => {
    const hidden =
      dashboard.stateOverrides?.[
        s === "decision"
          ? "hiddenDecisions"
          : s === "constraint"
            ? "hiddenConstraints"
            : "hiddenOpenTasks"
      ] ?? [];
    const hiddenKeys = new Set(hidden.map((i) => i.toLowerCase()));
    const derived = (
      s === "decision"
        ? (dashboard.derivedProjectState?.decisions ?? [])
        : s === "constraint"
          ? (dashboard.derivedProjectState?.constraints ?? [])
          : (dashboard.derivedProjectState?.openTasks ?? [])
    ).filter((i) => !hiddenKeys.has(i.toLowerCase()));
    const manual = dashboard.memory.filter(
      (i) => i.type === s,
    );
    return acc + derived.length + manual.length;
  }, 0);

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

  function rebuildState() {
    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${project.id}/state`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error("Rebuild failed.");
      },
      "Rebuilding…",
      "State rebuilt.",
    );
  }

  function regenerateBriefs() {
    const targetProfileKey =
      latestPacket?.targetProfileKey ?? "chatgpt_planning";
    const kind = latestPacket?.kind ?? "fresh_chat_bootstrap";
    const flowId = createClientFlowId("brief");
    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${project.id}/bootstrap`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            telemetry: {
              surface: "web-dashboard",
              area: "briefs",
              event: "brief_generated",
              flowId,
              logSuccess: true,
            },
            body: JSON.stringify({
              targetProfileKey,
              kind,
              deep: kind === "fresh_chat_bootstrap",
            }),
          },
        );
        if (!res.ok) throw new Error("Regeneration failed.");
      },
      "Regenerating brief…",
      "Brief regenerated.",
    );
  }

  function saveStateOverrides() {
    const payload = buildProjectMemoryOverridePatch(
      { overview, objective, progress },
      initialDrafts,
    );

    if (!payload) {
      setEditingMemory(false);
      setStatus("No memory changes to save.");
      return;
    }

    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${project.id}/state`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) throw new Error("Save failed.");
        setEditingMemory(false);
      },
      "Saving…",
      "Saved.",
    );
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

  return (
    <div className="space-y-6">
      {/* ─── Header strip ─── */}
      <FadeIn>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingProject ? (
              <div className="space-y-3 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={nameInputRef}
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
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      statusReady
                        ? "bg-[var(--relay-success)]/10 text-[var(--relay-success)]"
                        : "bg-[var(--relay-warning)]/10 text-[var(--relay-warning)]",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        statusReady
                          ? "bg-[var(--relay-success)]"
                          : "bg-[var(--relay-warning)]",
                      )}
                    />
                    {statusText}
                  </span>
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
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center gap-2 rounded-[var(--relay-radius-sm)] pr-1"
                    onMouseEnter={() => setHeaderHovered(true)}
                    onMouseLeave={() => setHeaderHovered(false)}
                  >
                    <h1 className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                      {projectMeta.name}
                    </h1>
                    <AnimatePresence>
                      {headerHovered && (
                        <motion.button
                          type="button"
                          onClick={() => setEditingProject(true)}
                          className="inline-flex h-7 items-center gap-1 rounded-[var(--relay-radius-sm)] px-2 text-[11px] font-medium text-[var(--relay-muted)] overflow-hidden whitespace-nowrap hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--relay-accent)]"
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: "auto", opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Pencil className="h-3 w-3 shrink-0" />
                          <span>Edit</span>
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      statusReady
                        ? "bg-[var(--relay-success)]/10 text-[var(--relay-success)]"
                        : "bg-[var(--relay-warning)]/10 text-[var(--relay-warning)]",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        statusReady
                          ? "bg-[var(--relay-success)]"
                          : "bg-[var(--relay-warning)]",
                      )}
                    />
                    {statusText}
                  </span>
                </div>
                {projectMeta.description ? (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--relay-muted)] max-w-2xl">
                    {projectMeta.description}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={rebuildState}
              className="h-7 text-xs gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              Rebuild
            </Button>
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
            overview={overview}
            objective={objective}
            progress={progress}
            editingMemory={editingMemory}
            setEditingMemory={setEditingMemory}
            onSave={saveStateOverrides}
            onOverviewChange={setOverview}
            onObjectiveChange={setObjective}
            onProgressChange={setProgress}
            pending={pending}
          />
          <DashboardBriefCard
            projectId={project.id}
            packets={dashboard.packets}
            onRegenerate={regenerateBriefs}
            pending={pending}
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

      {/* Status toast */}
      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
