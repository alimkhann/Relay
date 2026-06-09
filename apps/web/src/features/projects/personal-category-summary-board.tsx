"use client";

import Link from "next/link";

import type { MemoryItemDto } from "@relay/shared";
import {
  PERSONAL_CATEGORY_META,
  personalCategoryFromMetadata,
  sortPersonalCategoriesByFill,
} from "@relay/shared/constants/memory-taxonomy";

const PREVIEW_PER_COLUMN = 3;

/**
 * Read-only Overview summary of personal memory by Folk category — the personal
 * analogue of DashboardGovernanceSummary. All seven categories as columns on one
 * horizontally-scrollable row, ordered most-filled + most-recent first, showing a
 * 3-item preview each with a "+N more →" link into the memory tab. Editing lives
 * on the memory tab, not here.
 */
export function PersonalCategorySummaryBoard({
  projectId,
  memory,
}: {
  projectId: string;
  memory: MemoryItemDto[];
}) {
  const orderedCategories = sortPersonalCategoriesByFill(memory);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      {orderedCategories.map((category) => {
        const meta = PERSONAL_CATEGORY_META[category];
        const items = memory.filter(
          (item) => personalCategoryFromMetadata(item.metadata) === category,
        );
        const preview = items.slice(0, PREVIEW_PER_COLUMN);
        const overflow = items.length - preview.length;

        return (
          <div
            key={category}
            className="flex w-[260px] shrink-0 flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
            style={{ borderLeftWidth: 2, borderLeftColor: meta.color }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <span className="text-xs font-medium text-[var(--relay-ink)]">
                {meta.label}
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
                    No {meta.label.toLowerCase()} yet.
                  </p>
                </div>
              ) : (
                preview.map((item) => (
                  <div key={item.id} className="px-3.5 py-2">
                    <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] line-clamp-1">
                      {item.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {overflow > 0 && (
              <div className="px-3.5 py-2 border-t border-[var(--relay-line)]">
                <Link
                  href={`/memory?project=${projectId}&tab=${category}`}
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
