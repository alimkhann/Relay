"use client";

import Link from "next/link";
import {
  type ProjectContextSection,
  type ProjectDashboardDto,
} from "@relay/shared";
import { buildProjectContextItems } from "@relay/shared/utils/project-context";

const PREVIEW_PER_COLUMN = 3;

/* ─── Column model (governed project-state types + memory-item types) ─── */

interface SummaryColumn {
  key: string;
  label: string;
  color: string;
  /** Memory-page tab to link "+N more" to. */
  tab: string;
  texts: string[];
}

const colorBySection: Record<ProjectContextSection, string> = {
  decision: "var(--relay-section-decision)",
  constraint: "var(--relay-section-constraint)",
  task: "var(--relay-section-task)",
};

/**
 * Overview bottom board: a compact, horizontally-scrollable preview of all five
 * memory-type columns (decisions / tasks / constraints / notes / requirements),
 * mirroring the personal overview board. Governed three come from project state;
 * notes + requirements are plain memory items. Read-only — 3-item preview with a
 * "+N more →" link into the memory tab.
 */
export function DashboardGovernanceSummary({
  projectId,
  dashboard,
}: {
  projectId: string;
  dashboard: ProjectDashboardDto;
}) {
  const memoryTexts = (type: "note" | "requirement") =>
    dashboard.memory.filter((item) => item.type === type).map((item) => item.content);

  const columns: SummaryColumn[] = [
    { key: "decision", label: "Decisions", color: colorBySection.decision, tab: "decisions", texts: buildProjectContextItems(dashboard, "decision").map((i) => i.text) },
    { key: "task", label: "Tasks", color: colorBySection.task, tab: "tasks", texts: buildProjectContextItems(dashboard, "task").map((i) => i.text) },
    { key: "constraint", label: "Constraints", color: colorBySection.constraint, tab: "constraints", texts: buildProjectContextItems(dashboard, "constraint").map((i) => i.text) },
    { key: "note", label: "Notes", color: "#a1a1aa", tab: "notes", texts: memoryTexts("note") },
    { key: "requirement", label: "Requirements", color: "#ef4444", tab: "requirements", texts: memoryTexts("requirement") },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      {columns.map((column) => {
        const preview = column.texts.slice(0, PREVIEW_PER_COLUMN);
        const overflow = column.texts.length - preview.length;

        return (
          <div
            key={column.key}
            className="flex w-[260px] shrink-0 flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
            style={{ borderLeftWidth: 2, borderLeftColor: column.color }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span className="text-xs font-medium text-[var(--relay-ink)]">
                {column.label}
              </span>
              <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">
                {column.texts.length}
              </span>
            </div>

            {/* Items */}
            <div className="flex-1">
              {preview.length === 0 ? (
                <div className="px-3.5 py-4">
                  <p className="text-[12px] text-[var(--relay-muted)]">
                    No {column.label.toLowerCase()} yet.
                  </p>
                </div>
              ) : (
                preview.map((text, index) => (
                  <div key={index} className="px-3.5 py-2">
                    <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] line-clamp-1">
                      {text}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {overflow > 0 && (
              <div className="px-3.5 py-2 border-t border-[var(--relay-line)]">
                <Link
                  href={`/memory?project=${projectId}&tab=${column.tab}`}
                  className="text-[11px] text-[var(--relay-accent)] hover:underline"
                >
                  + {overflow} more &rarr;
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
