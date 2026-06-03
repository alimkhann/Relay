"use client";

import type { MemoryItemDto } from "@relay/shared";
import {
  PERSONAL_CATEGORY_META,
  personalCategories,
  personalCategoryFromMetadata,
} from "@relay/shared";

import { MemoryItemCard } from "@/components/memory/memory-item-card";
import { cn } from "@/lib/cn";

/**
 * Read-only column board for personal memory, mirroring the project dashboard's
 * GovernanceSection layout but keyed on the Folk personalCategory
 * (metadata.personalCategory) instead of the project type enum. One column per
 * category that has at least one item. Personal-only.
 */
export function PersonalCategoryBoard({ items }: { items: MemoryItemDto[] }) {
  const columns = personalCategories
    .map((category) => ({
      category,
      meta: PERSONAL_CATEGORY_META[category],
      items: items.filter((item) => personalCategoryFromMetadata(item.metadata) === category),
    }))
    .filter((column) => column.items.length > 0);

  if (columns.length === 0) return null;

  return (
    <div className={cn("grid gap-3 grid-cols-1 lg:grid-cols-3")}>
      {columns.map(({ category, meta, items: columnItems }) => (
        <div
          key={category}
          className="flex flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
          style={{ borderLeftWidth: 2, borderLeftColor: meta.color }}
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--relay-line)]">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
            <span className="text-xs font-medium text-[var(--relay-ink)]">{meta.label}</span>
            <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">{columnItems.length}</span>
          </div>
          {/* Column body */}
          <div className="flex flex-col gap-2 p-2.5">
            {columnItems.map((item) => (
              <MemoryItemCard key={item.id} item={item} showTypeLabel={false} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
