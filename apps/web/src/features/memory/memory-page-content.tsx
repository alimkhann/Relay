"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectDashboardDto } from "@relay/shared";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { GovernanceSection } from "@/features/projects/governance-section";
import {
  buildProjectMemoryOverridePatch,
  deriveProjectMemoryDrafts,
} from "@/features/projects/project-memory-state";
import { cn } from "@/lib/cn";
import { relayClientFetch } from "@/lib/telemetry/fetch";

type MemoryTab = "all" | "decisions" | "tasks" | "constraints";

interface MemoryPageContentProps {
  project: { id: string; name: string; description?: string | null };
  dashboard: ProjectDashboardDto;
}

function countSectionItems(dashboard: ProjectDashboardDto, section: "decision" | "task" | "constraint"): number {
  const hiddenKey = section === "decision" ? "hiddenDecisions" : section === "constraint" ? "hiddenConstraints" : "hiddenOpenTasks";
  const hidden = dashboard.stateOverrides?.[hiddenKey] ?? [];
  const hiddenKeys = new Set(hidden.map((i) => i.toLowerCase()));
  const derived = (
    section === "decision"
      ? (dashboard.derivedProjectState?.decisions ?? [])
      : section === "constraint"
        ? (dashboard.derivedProjectState?.constraints ?? [])
        : (dashboard.derivedProjectState?.openTasks ?? [])
  ).filter((i) => !hiddenKeys.has(i.toLowerCase()));
  const manual = dashboard.memory.filter((i) => i.type === section);
  return derived.length + manual.length;
}

export function MemoryPageContent({
  project,
  dashboard,
}: MemoryPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [editingMemory, setEditingMemory] = useState(false);

  const tabParam = searchParams.get("tab") as MemoryTab | null;
  const urlTab: MemoryTab = tabParam && ["all", "decisions", "tasks", "constraints"].includes(tabParam) ? tabParam : "all";
  const [localTab, setLocalTab] = useState<MemoryTab>(urlTab);
  const [tabPending, startTabTransition] = useTransition();

  // Sync local tab when URL changes externally (e.g. governance links)
  useEffect(() => {
    setLocalTab(urlTab);
  }, [urlTab]);

  const activeTab = localTab;

  const tabCounts = useMemo(() => {
    const decisions = countSectionItems(dashboard, "decision");
    const tasks = countSectionItems(dashboard, "task");
    const constraints = countSectionItems(dashboard, "constraint");
    return { all: decisions + tasks + constraints, decisions, tasks, constraints };
  }, [dashboard]);

  const memoryHealth = useMemo(() => {
    const items = dashboard.memory;
    const active = items.filter((i) => i.decayScore >= 0.3).length;
    const fading = items.filter((i) => i.decayScore >= 0.1 && i.decayScore < 0.3).length;
    return { active, fading, total: items.length };
  }, [dashboard.memory]);

  const visibleSections = useMemo(() => {
    if (activeTab === "decisions") return ["decision"] as const;
    if (activeTab === "tasks") return ["task"] as const;
    if (activeTab === "constraints") return ["constraint"] as const;
    return ["decision", "task", "constraint"] as const;
  }, [activeTab]);

  const initialDrafts = deriveProjectMemoryDrafts({
    dashboard,
    fallbackOverview: project.description,
  });
  const memoryDraftResetKey = JSON.stringify(initialDrafts);
  const [overview, setOverview] = useState(initialDrafts.overview);
  const [objective, setObjective] = useState(initialDrafts.objective);
  const [progress, setProgress] = useState(initialDrafts.progress);

  useEffect(() => {
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
          router.refresh();
        } catch (cause) {
          setStatus(
            cause instanceof Error ? cause.message : "Request failed.",
          );
        }
      })();
    });
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

      {/* Overview / Objective / Progress */}
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

      {/* Tab pills */}
      <FadeIn delay={0.1}>
        <div className="flex items-center gap-2">
          {([
            { key: "all" as const, label: "All", count: tabCounts.all },
            { key: "decisions" as const, label: "Decisions", count: tabCounts.decisions },
            { key: "tasks" as const, label: "Tasks", count: tabCounts.tasks },
            { key: "constraints" as const, label: "Constraints", count: tabCounts.constraints },
          ]).map((tab) => (
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
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-[var(--relay-ink)] text-[var(--relay-bg)]"
                  : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </FadeIn>

      {/* Governance (decisions, tasks, constraints) */}
      <FadeIn delay={0.15}>
        <div className={cn("transition-opacity duration-150", tabPending && "opacity-50")}>
        <GovernanceSection
          projectId={project.id}
          dashboard={dashboard}
          visibleSections={visibleSections}
        />
        </div>
      </FadeIn>

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
