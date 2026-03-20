"use client";

import Link from "next/link";
import type { ProjectDashboardDto, MemoryItemType, SourceSurface } from "@relay/shared";

/* ─── Types ─── */

type ContextSection = "decision" | "constraint" | "task";

interface ContextItem {
  key: string;
  section: ContextSection;
  text: string;
  source: "manual" | "derived";
  memoryId?: string;
  sourceSurface?: SourceSurface | null;
  capturedAt?: string | null;
}

/* ─── Constants ─── */

const memoryTypeBySection: Record<ContextSection, MemoryItemType> = {
  decision: "decision",
  constraint: "constraint",
  task: "task",
};

const labelBySection: Record<ContextSection, string> = {
  decision: "Decisions",
  constraint: "Constraints",
  task: "Tasks",
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

const tabBySection: Record<ContextSection, string> = {
  decision: "decisions",
  constraint: "constraints",
  task: "tasks",
};

/* ─── Helpers ─── */

function buildContextItems(
  dashboard: ProjectDashboardDto,
  section: ContextSection,
): ContextItem[] {
  const hidden =
    dashboard.stateOverrides?.[hiddenKeyBySection[section]] ?? [];
  const hiddenKeys = new Set(hidden.map((item) => item.toLowerCase()));

  const derivedItems = (
    section === "decision"
      ? (dashboard.derivedProjectState?.decisions ?? [])
      : section === "constraint"
        ? (dashboard.derivedProjectState?.constraints ?? [])
        : (dashboard.derivedProjectState?.openTasks ?? [])
  )
    .filter((item) => !hiddenKeys.has(item.toLowerCase()))
    .map((text) => ({
      key: `derived:${section}:${text}`,
      section,
      text,
      source: "derived" as const,
    }));

  const manualItems = dashboard.memory
    .filter((item) => item.type === memoryTypeBySection[section])
    .map((item) => ({
      key: `manual:${item.id}`,
      section,
      text: item.content,
      source: "manual" as const,
      memoryId: item.id,
      sourceSurface: item.sourceSurface,
      capturedAt: item.capturedAt,
    }));

  return [...manualItems, ...derivedItems];
}

/* ─── Component ─── */

interface DashboardGovernanceSummaryProps {
  projectId: string;
  dashboard: ProjectDashboardDto;
}

const sections: ContextSection[] = ["decision", "constraint", "task"];

export function DashboardGovernanceSummary({
  projectId,
  dashboard,
}: DashboardGovernanceSummaryProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {sections.map((section) => {
        const items = buildContextItems(dashboard, section);
        const preview = items.slice(0, 3);
        const overflow = items.length - 3;

        return (
          <div
            key={section}
            className="flex flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
            style={{
              borderLeftWidth: 2,
              borderLeftColor: colorBySection[section],
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span className="text-xs font-medium text-[var(--relay-ink)]">
                {labelBySection[section]}
              </span>
              <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">
                {items.length}
              </span>
            </div>

            {/* Items */}
            <div className="flex-1">
              {preview.length === 0 ? (
                <div className="px-3.5 py-4">
                  <p className="text-[12px] text-[var(--relay-muted)]">
                    No {labelBySection[section].toLowerCase()} yet.
                  </p>
                </div>
              ) : (
                preview.map((item) => (
                  <div key={item.key} className="px-3.5 py-2">
                    <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] line-clamp-1">
                      {item.text}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {overflow > 0 && (
              <div className="px-3.5 py-2 border-t border-[var(--relay-line)]">
                <Link
                  href={`/memory?project=${projectId}&tab=${tabBySection[section]}`}
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
