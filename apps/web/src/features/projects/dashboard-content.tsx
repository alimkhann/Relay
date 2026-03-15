"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDashboardDto, ProjectStateStatusDto } from "@relay/shared";
import {
  RefreshCw,
  FileDown,
  MessageSquare,
  Database,
  RotateCcw,
  Trash2,
  Pencil,
} from "lucide-react";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { EmptyState } from "@/components/ui/empty-state";
import { GovernanceSection } from "@/features/projects/governance-section";
import { cn } from "@/lib/cn";
import { createClientFlowId } from "@/lib/telemetry/client";
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

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function targetLabel(key: string): string {
  const map: Record<string, string> = {
    chatgpt_planning: "ChatGPT",
    claude_code_build: "Claude",
    codex_implementation: "Codex",
    perplexity_research: "Perplexity",
  };
  return map[key] ?? key;
}

/* ─── Truncated accordion helpers ─── */

function TruncatedContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <p
        className={cn(
          "text-[12px] leading-relaxed text-[var(--relay-ink-secondary)]",
          !expanded && "line-clamp-3",
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-1 text-[11px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition-colors"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

function MemoryAccordion({
  overview,
  objective,
  progress,
}: {
  overview: string;
  objective: string;
  progress: string;
}) {
  const defaults = [
    overview && "overview",
    objective && "objective",
    progress && "progress",
  ].filter(Boolean) as string[];

  return (
    <Accordion type="multiple" defaultValue={defaults}>
      {overview ? (
        <AccordionItem value="overview">
          <AccordionTrigger>Overview</AccordionTrigger>
          <AccordionContent>
            <TruncatedContent text={overview} />
          </AccordionContent>
        </AccordionItem>
      ) : null}
      {objective ? (
        <AccordionItem value="objective">
          <AccordionTrigger>Objective</AccordionTrigger>
          <AccordionContent>
            <TruncatedContent text={objective} />
          </AccordionContent>
        </AccordionItem>
      ) : null}
      {progress ? (
        <AccordionItem value="progress">
          <AccordionTrigger>Progress</AccordionTrigger>
          <AccordionContent>
            <TruncatedContent text={progress} />
          </AccordionContent>
        </AccordionItem>
      ) : null}
    </Accordion>
  );
}

function BriefAccordion({
  packets,
}: {
  packets: DashboardContentProps["dashboard"]["packets"];
}) {
  const defaults = packets.map((_, i) => `brief-${i}`);

  return (
    <Accordion type="multiple" defaultValue={defaults}>
      {packets.map((packet, index) => (
        <AccordionItem
          key={`${packet.targetProfileKey}-${index}`}
          value={`brief-${index}`}
        >
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              {targetLabel(packet.targetProfileKey)}
              <span className="text-[10px] text-[var(--relay-faint)] rounded-full bg-[var(--relay-soft)] px-1.5 py-0.5 font-normal">
                {packet.kind === "fresh_chat_bootstrap"
                  ? "Full brief"
                  : "Continuity"}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <TruncatedContent text={packet.content} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
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

  const totalChats = dashboard.sessionHistory.length;
  const latestPacket = dashboard.packets[0];

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
              event: "brief_regenerate.submit",
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
      {
        overview,
        objective,
        progress,
      },
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

  function toggleSessionArchive(sessionId: string, archived: boolean) {
    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${project.id}/sessions/${sessionId}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ archived }),
          },
        );
        if (!res.ok) throw new Error("Session update failed.");
      },
      archived ? "Detaching…" : "Restoring…",
      archived ? "Detached." : "Restored.",
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
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Chats",
              value: totalChats,
              icon: <MessageSquare className="h-3.5 w-3.5" />,
            },
            {
              label: "Context",
              value: totalContextItems,
              icon: <Database className="h-3.5 w-3.5" />,
            },
            {
              label: "Brief",
              value: latestPacket ? "Ready" : "None",
              icon: <FileDown className="h-3.5 w-3.5" />,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-2.5 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-3 py-2.5"
            >
              <span className="text-[var(--relay-faint)]">{stat.icon}</span>
              <div>
                <p className="text-sm font-medium text-[var(--relay-ink)] tabular-nums">
                  {stat.value}
                </p>
                <p className="text-[11px] text-[var(--relay-muted)]">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* ─── 2-column: Memory + Brief ─── */}
      <FadeIn delay={0.1}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Memory card */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <Link
                href={`/memory?project=${project.id}`}
                className="text-xs font-medium text-[var(--relay-ink)] hover:text-[var(--relay-accent)] transition-colors"
              >
                Memory
              </Link>
              <button
                onClick={() => setEditingMemory(!editingMemory)}
                className="flex items-center gap-1 text-[11px] text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition-colors"
              >
                <Pencil className="h-3 w-3" />
                {editingMemory ? "Cancel" : "Edit"}
              </button>
            </div>
            <div className="px-3.5 py-3 space-y-3">
              {editingMemory ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                      Overview
                    </span>
                    <textarea
                      className="w-full min-h-[72px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                      value={overview}
                      onChange={(e) => setOverview(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                      Current objective
                    </span>
                    <textarea
                      className="w-full min-h-[72px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                      Recent progress
                    </span>
                    <textarea
                      className="w-full min-h-[72px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                      value={progress}
                      onChange={(e) => setProgress(e.target.value)}
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={saveStateOverrides}
                    className="h-7 text-[11px]"
                  >
                    Save
                  </Button>
                </>
              ) : (
                <>
                  {(overview || objective || progress) ? (
                    <MemoryAccordion overview={overview} objective={objective} progress={progress} />
                  ) : (
                    <EmptyState
                      title="No memory yet"
                      description="Relay will populate this after your first chat."
                      className="py-4"
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Project Brief card */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <Link
                href={`/brief?project=${project.id}`}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <FileDown className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
                <span className="text-xs font-medium text-[var(--relay-ink)]">
                  Project Brief
                </span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={regenerateBriefs}
                className="h-6 text-[11px] px-2"
              >
                Regenerate
              </Button>
            </div>
            <div className="px-3.5 py-3">
              {dashboard.packets.length > 0 ? (
                <BriefAccordion packets={dashboard.packets} />
              ) : (
                <EmptyState
                  title="No briefs yet"
                  description="Briefs are generated after your first chat capture."
                  className="py-4"
                />
              )}
            </div>
          </div>
        </div>
      </FadeIn>

      {/* ─── Recent Activity ─── */}
      <FadeIn delay={0.15}>
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
            <Link
              href="/activity"
              className="flex items-center gap-2 hover:text-[var(--relay-accent)] transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
              <span className="text-xs font-medium">
                Recent Activity
              </span>
              <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">
                {totalChats}
              </span>
            </Link>
          </div>
          <div className="divide-y divide-[var(--relay-line)]">
            {dashboard.sessionHistory.length === 0 ? (
              <div className="px-3.5 py-6">
                <EmptyState
                  title="No chats yet"
                  description="Chats appear here after Relay captures them."
                  className="py-2"
                />
              </div>
            ) : (
              dashboard.sessionHistory.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[var(--relay-soft)]/50 transition-colors",
                    session.isArchived && "opacity-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--relay-ink)]">
                      {session.title ?? session.url}
                    </p>
                    <p className="text-[11px] text-[var(--relay-muted)]">
                      {session.platform} · {session.turnCount} turns ·{" "}
                      {relativeTime(session.capturedAt)}
                      {session.isArchived ? " · detached" : ""}
                    </p>
                  </div>
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={pending}
                    onClick={() =>
                      toggleSessionArchive(session.id, !session.isArchived)
                    }
                  >
                    {session.isArchived ? (
                      <RotateCcw className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-ink)]" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-danger)]" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </FadeIn>

      {/* ─── Governance section ─── */}
      <FadeIn delay={0.2}>
        <GovernanceSection projectId={project.id} dashboard={dashboard} />
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
