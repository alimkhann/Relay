"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type MemoryItemType,
  type ProjectContextItem,
  type ProjectContextSection,
  type ProjectDashboardDto,
} from "@relay/shared";
import { buildProjectContextItems } from "@relay/shared/utils/project-context";
import {
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProvenanceChip } from "@/components/memory/provenance-chip";
import { cn } from "@/lib/cn";
import { relayClientFetch } from "@/lib/telemetry/fetch";

/* ─── Types ─── */

type ContextSection = ProjectContextSection;
type ContextItem = ProjectContextItem;

/* ─── Constants ─── */

const ITEMS_PER_PAGE = 10;

const labelBySection: Record<ContextSection, string> = {
  decision: "Decisions",
  constraint: "Constraints",
  task: "Tasks",
};

const memoryTypeBySection: Record<ContextSection, MemoryItemType> = {
  decision: "decision",
  constraint: "constraint",
  task: "task",
};

const colorBySection: Record<ContextSection, string> = {
  decision: "var(--relay-section-decision)",
  constraint: "var(--relay-section-constraint)",
  task: "var(--relay-section-task)",
};

const hiddenKeyBySection: Record<
  ContextSection,
  "hiddenDecisions" | "hiddenConstraints" | "hiddenOpenTasks"
> = {
  decision: "hiddenDecisions",
  constraint: "hiddenConstraints",
  task: "hiddenOpenTasks",
};

/* ─── Component ─── */

export function GovernanceSection({
  projectId,
  dashboard,
  visibleSections: visibleSectionsProp,
}: {
  projectId: string;
  dashboard: ProjectDashboardDto;
  visibleSections?: readonly ContextSection[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [contextPages, setContextPages] = useState<
    Record<ContextSection, number>
  >({
    decision: 0,
    constraint: 0,
    task: 0,
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [drafts, setDrafts] = useState<Record<ContextSection, string>>({
    decision: "",
    constraint: "",
    task: "",
  });

  const sections: ContextSection[] = visibleSectionsProp
    ? [...visibleSectionsProp]
    : ["decision", "task", "constraint"];

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

  function removeItem(item: ContextItem) {
    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const res = await relayClientFetch(
            `/api/memory/${item.memoryId}`,
            { method: "DELETE" },
          );
          if (!res.ok) throw new Error("Removal failed.");
        },
        "Removing…",
        "Removed.",
      );
      return;
    }
    const current =
      dashboard.stateOverrides?.[
        item.section === "decision"
          ? "hiddenDecisions"
          : item.section === "constraint"
            ? "hiddenConstraints"
            : "hiddenOpenTasks"
      ] ?? [];
    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${projectId}/state`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              [hiddenKeyBySection[item.section]]: [
                ...new Set([...current, item.text]),
              ],
            }),
          },
        );
        if (!res.ok) throw new Error("Update failed.");
      },
      "Updating…",
      "Updated.",
    );
  }

  function addManualContext(section: ContextSection) {
    const text = drafts[section].trim();
    if (!text) return;
    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${projectId}/memory`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: memoryTypeBySection[section],
              title: null,
              content: text,
              sourceSurface: "web",
            }),
          },
        );
        if (!res.ok) throw new Error("Creation failed.");
        setDrafts((d) => ({ ...d, [section]: "" }));
      },
      "Adding…",
      "Added.",
    );
  }

  function saveEdit(item: ContextItem) {
    const nextText = editingText.trim();
    if (!nextText) return;
    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const res = await relayClientFetch(
            `/api/memory/${item.memoryId}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ content: nextText }),
            },
          );
          if (!res.ok) throw new Error("Update failed.");
          setEditingKey(null);
          setEditingText("");
        },
        "Saving…",
        "Saved.",
      );
      return;
    }
    runMutation(
      async () => {
        const createRes = await relayClientFetch(
          `/api/projects/${projectId}/memory`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: memoryTypeBySection[item.section],
              title: null,
              content: nextText,
              sourceSurface: "web",
            }),
          },
        );
        if (!createRes.ok) throw new Error("Replacement failed.");
        const current =
          dashboard.stateOverrides?.[hiddenKeyBySection[item.section]] ?? [];
        const hideRes = await relayClientFetch(
          `/api/projects/${projectId}/state`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              [hiddenKeyBySection[item.section]]: [
                ...new Set([...current, item.text]),
              ],
            }),
          },
        );
        if (!hideRes.ok) throw new Error("Failed to hide old item.");
        setEditingKey(null);
        setEditingText("");
      },
      "Replacing…",
      "Replaced.",
    );
  }

  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3", sections.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3")}>
        {sections.map((section) => {
          const items = buildProjectContextItems(dashboard, section);
          const page = contextPages[section];
          const totalPages = Math.max(
            1,
            Math.ceil(items.length / ITEMS_PER_PAGE),
          );
          const pageItems = items.slice(
            page * ITEMS_PER_PAGE,
            (page + 1) * ITEMS_PER_PAGE,
          );

          return (
            <div
              key={section}
              className="flex flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
              style={{ borderLeftWidth: 2, borderLeftColor: colorBySection[section] }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--relay-ink)]">
                    {labelBySection[section]}
                  </span>
                  <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">
                    {items.length}
                  </span>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      className="p-0.5 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] disabled:opacity-30 transition-colors"
                      disabled={page === 0}
                      onClick={() =>
                        setContextPages((p) => ({
                          ...p,
                          [section]: p[section] - 1,
                        }))
                      }
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <span className="text-[10px] text-[var(--relay-faint)] tabular-nums min-w-[24px] text-center">
                      {page + 1}/{totalPages}
                    </span>
                    <button
                      className="p-0.5 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] disabled:opacity-30 transition-colors"
                      disabled={page >= totalPages - 1}
                      onClick={() =>
                        setContextPages((p) => ({
                          ...p,
                          [section]: p[section] + 1,
                        }))
                      }
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="flex-1 divide-y divide-[var(--relay-line)]">
                {pageItems.length === 0 ? (
                  <div className="px-3.5 py-4">
                    <p className="text-[12px] text-[var(--relay-muted)]">
                      No {labelBySection[section].toLowerCase()} yet.
                    </p>
                  </div>
                ) : (
                  pageItems.map((item) => (
                    <div
                      key={item.key}
                      className="group px-3.5 py-2.5 hover:bg-[var(--relay-soft)]/50 transition-colors"
                    >
                      {editingKey === item.key ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full min-h-[60px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              disabled={pending || !editingText.trim()}
                              onClick={() => saveEdit(item)}
                              className="h-6 text-[11px] px-2"
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingKey(null);
                                setEditingText("");
                              }}
                              className="h-6 text-[11px] px-2"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)]">
                              {item.text}
                            </p>
                            {item.source === "manual" && item.sourceSurface && (
                              <div className="mt-1">
                                <ProvenanceChip
                                  sourceSurface={item.sourceSurface}
                                  capturedAt={item.capturedAt}
                                  compact
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              className="p-1 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] transition-colors"
                              onClick={() => {
                                setEditingKey(item.key);
                                setEditingText(item.text);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              className="p-1 rounded text-[var(--relay-faint)] hover:text-[var(--relay-danger)] transition-colors"
                              onClick={() => removeItem(item)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add new */}
              <div className="mt-auto border-t border-[var(--relay-line)] bg-[var(--relay-soft)]/40 px-3.5 py-2">
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 min-w-0 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1 text-[12px] outline-none focus:border-[var(--relay-accent)] placeholder:text-[var(--relay-faint)]"
                    placeholder={`Add ${section}…`}
                    value={drafts[section]}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [section]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && drafts[section].trim())
                        addManualContext(section);
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={pending || !drafts[section].trim()}
                    onClick={() => addManualContext(section)}
                    className="h-7 text-[11px] px-2.5 shrink-0"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status toast */}
      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
