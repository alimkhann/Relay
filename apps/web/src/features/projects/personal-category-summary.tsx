"use client";

import Link from "next/link";

import type { MemoryItemDto } from "@relay/shared";
import {
  PERSONAL_CATEGORY_META,
  personalCategories,
  personalCategoryFromMetadata,
} from "@relay/shared";

import { EmptyState } from "@/components/ui/empty-state";

/**
 * Overview-tab card for the PERSONAL project: a compact breakdown of personal
 * memory by Folk category (dot + label + count), each linking to that category
 * on the memory page. Replaces the project-state Overview/Objective/Progress
 * card, which is project-shaped and empty for personal memory.
 */
export function PersonalCategorySummary({
  projectId,
  memory,
}: {
  projectId: string;
  memory: MemoryItemDto[];
}) {
  const counts = personalCategories
    .map((category) => ({
      category,
      meta: PERSONAL_CATEGORY_META[category],
      count: memory.filter((item) => personalCategoryFromMetadata(item.metadata) === category).length,
    }))
    .filter((row) => row.count > 0);

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
        <span className="text-xs font-medium text-[var(--relay-ink)]">Personal memory</span>
        <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">{memory.length}</span>
      </div>
      <div className="px-3.5 py-3">
        {counts.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Relay fills your personal memory as you chat about yourself."
            className="py-2"
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {counts.map(({ category, meta, count }) => (
              <Link
                key={category}
                href={`/memory?project=${projectId}&tab=${category}`}
                className="flex items-center justify-between rounded-[var(--relay-radius-sm)] px-2 py-1.5 hover:bg-[var(--relay-soft)] transition-colors"
              >
                <span className="flex items-center gap-2 text-[12px] text-[var(--relay-ink)]">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  {meta.label}
                </span>
                <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">{count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
