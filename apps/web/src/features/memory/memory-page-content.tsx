"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getProjectContextCounts } from "@relay/shared/utils/project-context";
import {
  PERSONAL_CATEGORY_META,
  personalCategories,
  resolvePersonalCategory,
  type PersonalCategory,
} from "@relay/shared/constants/memory-taxonomy";
import type { MemoryItemDto } from "@relay/shared";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { useMemory } from "@/features/memory/use-memory";
import { useMemoryCacheSync } from "@/lib/query/memory-cache-sync";
import { queryKeys } from "@/lib/query/keys";
import { MemoryGraphContainer } from "@/features/graph/memory-graph-container";
import { MIN_GRAPH_ITEMS } from "@/features/graph/memory-graph-utils";
import { GovernanceSection } from "@/features/projects/governance-section";
import { MemoryItemsList } from "@/features/memory/memory-items-list";
import { PersonalCategoryBoard } from "@/features/memory/personal-category-board";
import { PersonalStateCard } from "@/features/projects/personal-state-card";
import {
  buildProjectMemoryOverridePatch,
  deriveProjectMemoryDrafts,
} from "@/features/projects/project-memory-state";
import { cn } from "@/lib/cn";
import { relayClientFetch } from "@/lib/telemetry/fetch";

type MemoryTab = "all" | "decisions" | "tasks" | "constraints" | "notes" | "requirements" | "artifacts";

// Color dot per regular tab, mirroring the personal Folk-category tab dots.
const TAB_DOT_COLOR: Partial<Record<MemoryTab, string>> = {
  decisions: "var(--relay-section-decision)",
  tasks: "var(--relay-section-task)",
  constraints: "var(--relay-section-constraint)",
  notes: "#a1a1aa",
  requirements: "#ef4444",
  artifacts: "#8b5cf6",
};

interface MemoryPageContentProps {
  project: { id: string; name: string; description?: string | null; kind?: "project" | "personal" };
}

export function MemoryPageContent({
  project,
}: MemoryPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: dashboard, isPending } = useMemory(project.id);
  useMemoryCacheSync(project.id);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [editingMemory, setEditingMemory] = useState(false);

  const tabParam = searchParams.get("tab") as MemoryTab | null;
  const validTabs: MemoryTab[] = ["all", "decisions", "tasks", "constraints", "notes", "requirements", "artifacts"];
  const urlTab: MemoryTab = tabParam && validTabs.includes(tabParam) ? tabParam : "all";
  const [localTab, setLocalTab] = useState<MemoryTab>(urlTab);
  const [tabPending, startTabTransition] = useTransition();
  // Personal dashboard uses a separate tab set (All + Folk categories).
  const personalUrlTab =
    tabParam && (personalCategories as readonly string[]).includes(tabParam)
      ? (tabParam as PersonalCategory)
      : "all";
  const [personalTab, setPersonalTab] = useState<PersonalCategory | "all">(personalUrlTab);

  // Sync local tab when URL changes externally (e.g. governance links)
  useEffect(() => {
    setLocalTab(urlTab);
  }, [urlTab]);

  useEffect(() => {
    setPersonalTab(personalUrlTab);
  }, [personalUrlTab]);

  const activeTab = localTab;

  const tabCounts = useMemo(() => {
    return dashboard
      ? getProjectContextCounts(dashboard)
      : { all: 0, decisions: 0, tasks: 0, constraints: 0, notes: 0, requirements: 0, artifacts: 0 };
  }, [dashboard]);

  const memoryHealth = useMemo(() => {
    const items = dashboard?.memory ?? [];
    const active = items.filter((i) => i.decayScore >= 0.3).length;
    const fading = items.filter((i) => i.decayScore >= 0.1 && i.decayScore < 0.3).length;
    return { active, fading, total: items.length };
  }, [dashboard?.memory]);

  const visibleSections = useMemo(() => {
    if (activeTab === "decisions") return ["decision"] as const;
    if (activeTab === "tasks") return ["task"] as const;
    if (activeTab === "constraints") return ["constraint"] as const;
    if (activeTab === "notes" || activeTab === "requirements" || activeTab === "artifacts") return [] as const;
    return ["decision", "task", "constraint"] as const;
  }, [activeTab]);

  const memoryItemsByType = useMemo(() => ({
    notes: (dashboard?.memory ?? []).filter((i) => i.type === "note"),
    requirements: (dashboard?.memory ?? []).filter((i) => i.type === "requirement"),
    artifacts: (dashboard?.memory ?? []).filter((i) => i.type === "artifact"),
  }), [dashboard?.memory]);

  // Personal dashboard: tabs are the Folk categories, not the project memory
  // types. Items are bucketed by metadata.personalCategory.
  const isPersonal = project.kind === "personal";
  const personalByCategory = useMemo(() => {
    const buckets: Record<PersonalCategory, MemoryItemDto[]> = {
      person: [], company: [], concept: [], event: [], meeting: [], signals: [], note: [],
    };
    for (const item of dashboard?.memory ?? []) {
      // Mirror the board: uncategorized items fall back to the Note bucket so
      // the tab counts match what the board actually renders.
      buckets[resolvePersonalCategory(item.metadata)].push(item);
    }
    return buckets;
  }, [dashboard?.memory]);

  const initialDrafts = dashboard
    ? deriveProjectMemoryDrafts({ dashboard, fallbackOverview: project.description })
    : { overview: "", objective: "", progress: "" };
  const memoryDraftResetKey = JSON.stringify(initialDrafts);
  const [overview, setOverview] = useState(initialDrafts.overview);
  const [objective, setObjective] = useState(initialDrafts.objective);
  const [progress, setProgress] = useState(initialDrafts.progress);

  useEffect(() => {
    if (!dashboard) return;
    const nextDrafts = deriveProjectMemoryDrafts({
      dashboard,
      fallbackOverview: project.description,
    });
    setOverview(nextDrafts.overview);
    setObjective(nextDrafts.objective);
    setProgress(nextDrafts.progress);
    setEditingMemory(false);
  }, [project.id, memoryDraftResetKey, project.description, dashboard]);

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

    startTransition(() => {
      void (async () => {
        setStatus("Saving…");
        try {
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
          setStatus("Saved.");
          await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(project.id) });
        } catch (cause) {
          setStatus(
            cause instanceof Error ? cause.message : "Request failed.",
          );
        }
      })();
    });
  }

  // `useMemory` keeps the previous project's data as a placeholder across project
  // switches, which would briefly flash the OLD project's memory (e.g. personal
  // notes in a normal project's Notes column). Treat a dashboard whose project id
  // doesn't match as still-loading.
  const dashboardMatchesProject = dashboard?.project?.id === project.id;
  if (!dashboard || !dashboardMatchesProject) {
    if (isPending || dashboard) {
      return (
        <div className="space-y-6 pt-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-44 w-full rounded-[var(--relay-radius)]" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-[var(--relay-radius)]" />
        </div>
      );
    }
    return (
      <EmptyState
        title="No data yet"
        description="Memory will appear after your first chat capture."
        className="py-12"
      />
    );
  }

  return (
    <div className="space-y-6 pt-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
              Memory
            </h1>
            <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
              Project context that Relay carries forward into every brief.
            </p>
          </div>
        </div>
      </FadeIn>

      {/* Memory Health */}
      {memoryHealth.total > 0 && (
        <FadeIn delay={0.02}>
          <div className="flex items-center gap-3 text-[12px] text-[var(--relay-muted)]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              {memoryHealth.active} active
            </span>
            {memoryHealth.fading > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                {memoryHealth.fading} fading
              </span>
            )}
            <span className="text-[var(--relay-line)]">·</span>
            <span>{memoryHealth.total} items</span>
          </div>
        </FadeIn>
      )}

      {/* Overview / Objective / Progress — project state, not for personal
          (personal's "About you" state lives on the Overview tab). */}
      {!isPersonal && (
      <FadeIn delay={0.05}>
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--relay-line)]">
            <span className="text-sm font-medium text-[var(--relay-ink)]">
              Project State
            </span>
            <button
              onClick={() => setEditingMemory(!editingMemory)}
              className="flex items-center gap-1 text-[11px] text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition-colors"
            >
              <Pencil className="h-3 w-3" />
              {editingMemory ? "Cancel" : "Edit"}
            </button>
          </div>
          <div className="px-4 py-4 space-y-4">
            {editingMemory ? (
              <>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                    Overview
                  </span>
                  <textarea
                    className="w-full min-h-[96px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                    value={overview}
                    onChange={(e) => setOverview(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                    Current objective
                  </span>
                  <textarea
                    className="w-full min-h-[96px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                    Recent progress
                  </span>
                  <textarea
                    className="w-full min-h-[96px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
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
              <div className="space-y-4">
                {overview ? (
                  <div>
                    <p className="text-[11px] font-medium text-[var(--relay-muted)] mb-1">
                      Overview
                    </p>
                    <p className="text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">
                      {overview}
                    </p>
                  </div>
                ) : null}
                {objective ? (
                  <div>
                    <p className="text-[11px] font-medium text-[var(--relay-muted)] mb-1">
                      Objective
                    </p>
                    <p className="text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">
                      {objective}
                    </p>
                  </div>
                ) : null}
                {progress ? (
                  <div>
                    <p className="text-[11px] font-medium text-[var(--relay-muted)] mb-1">
                      Progress
                    </p>
                    <p className="text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">
                      {progress}
                    </p>
                  </div>
                ) : null}
                {!overview && !objective && !progress && (
                  <p className="text-[13px] text-[var(--relay-muted)] py-2">
                    No memory yet. Relay will populate this after your first
                    chat.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </FadeIn>
      )}

      {dashboard.memory.length >= MIN_GRAPH_ITEMS && (
        <FadeIn delay={0.08}>
          <MemoryGraphContainer
            projectId={project.id}
            projectName={project.name}
            memoryItems={dashboard.memory}
          />
        </FadeIn>
      )}

      {/* Personal dashboard: editable "About you" state + Folk category tabs */}
      {isPersonal && (
        <>
          <FadeIn delay={0.05}>
            <PersonalStateCard
              editable
              projectId={project.id}
              overview={dashboard.projectState?.projectOverview ?? ""}
              objective={dashboard.projectState?.currentObjective ?? ""}
              overridden={Boolean(
                dashboard.stateOverrides?.projectOverviewOverride ||
                  dashboard.stateOverrides?.currentObjectiveOverride,
              )}
              onSaved={() =>
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.dashboard(project.id),
                })
              }
            />
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
              {([
                { key: "all" as const, label: "All", count: dashboard.memory.length },
                ...personalCategories.map((category) => ({
                  key: category,
                  label: PERSONAL_CATEGORY_META[category].label,
                  count: personalByCategory[category].length,
                  color: PERSONAL_CATEGORY_META[category].color,
                })),
              ])
                .filter((tab) => tab.key === "all" || tab.count > 0)
                .map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setPersonalTab(tab.key as PersonalCategory | "all");
                      const params = new URLSearchParams(searchParams.toString());
                      if (tab.key === "all") params.delete("tab");
                      else params.set("tab", tab.key);
                      startTabTransition(() => {
                        router.replace(`?${params.toString()}`, { scroll: false });
                      });
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                      personalTab === tab.key
                        ? "bg-[var(--relay-ink)] text-[var(--relay-bg)]"
                        : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
                    )}
                  >
                    {"color" in tab && tab.color ? (
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={{ backgroundColor: tab.color }}
                      />
                    ) : null}
                    {tab.label} ({tab.count})
                  </button>
                ))}
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className={cn("transition-opacity duration-150", tabPending && "opacity-50")}>
              {/* "All" → every Folk category column (scrollable); a single tab →
                  that one category's column. Same board chrome + CRUD either way. */}
              <PersonalCategoryBoard
                projectId={project.id}
                items={dashboard.memory}
                categories={personalTab === "all" ? undefined : [personalTab]}
              />
            </div>
          </FadeIn>
        </>
      )}

      {/* Tab pills (project dashboards) */}
      {!isPersonal && (
      <FadeIn delay={0.1}>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          {([
            { key: "all" as const, label: "All", count: tabCounts.all },
            { key: "decisions" as const, label: "Decisions", count: tabCounts.decisions },
            { key: "tasks" as const, label: "Tasks", count: tabCounts.tasks },
            { key: "constraints" as const, label: "Constraints", count: tabCounts.constraints },
            { key: "notes" as const, label: "Notes", count: tabCounts.notes },
            { key: "requirements" as const, label: "Requirements", count: tabCounts.requirements },
            { key: "artifacts" as const, label: "Artifacts", count: tabCounts.artifacts },
          ]).filter((tab) => tab.key === "all" || tab.count > 0).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setLocalTab(tab.key);
                const params = new URLSearchParams(searchParams.toString());
                if (tab.key === "all") {
                  params.delete("tab");
                } else {
                  params.set("tab", tab.key);
                }
                startTabTransition(() => {
                  router.replace(`?${params.toString()}`, { scroll: false });
                });
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-[var(--relay-ink)] text-[var(--relay-bg)]"
                  : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
              )}
            >
              {TAB_DOT_COLOR[tab.key] && (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: TAB_DOT_COLOR[tab.key] }}
                />
              )}
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </FadeIn>
      )}

      {/* Governance board (decisions, tasks, constraints + Notes column on
          the All / Notes tabs — notes are plain memory items). */}
      {!isPersonal &&
        (visibleSections.length > 0 ||
          activeTab === "all" ||
          activeTab === "notes" ||
          activeTab === "requirements") && (
          <FadeIn delay={0.15}>
            <div className={cn("transition-opacity duration-150", tabPending && "opacity-50")}>
              <GovernanceSection
                projectId={project.id}
                dashboard={dashboard}
                visibleSections={visibleSections}
                includeNotes={activeTab === "all" || activeTab === "notes"}
                includeRequirements={activeTab === "all" || activeTab === "requirements"}
              />
            </div>
          </FadeIn>
        )}

      {!isPersonal && activeTab === "artifacts" && memoryItemsByType.artifacts.length > 0 && (
        <FadeIn delay={0.2}>
          <div className={cn("transition-opacity duration-150", tabPending && "opacity-50")}>
            <MemoryItemsList items={memoryItemsByType.artifacts} label="Artifacts" projectId={project.id} />
          </div>
        </FadeIn>
      )}

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
