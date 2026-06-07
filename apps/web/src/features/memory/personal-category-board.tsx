"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { MemoryItemDto, PersonalCategory } from "@relay/shared";
import {
  PERSONAL_CATEGORY_META,
  personalCategories,
  personalCategoryFromMetadata,
  sortPersonalCategoriesByFill,
} from "@relay/shared";

import {
  MemoryColumnBoard,
  type BoardColumn,
} from "@/features/memory/memory-column-board";
import { relayClientFetch } from "@/lib/telemetry/fetch";

/**
 * Personal memory board: one column per Folk category (all seven, even empty),
 * laid out on a single horizontally-scrollable row. Mirrors the project
 * GovernanceSection chrome via the shared MemoryColumnBoard, but personal items
 * are plain memory rows (type 'note' + metadata.personalCategory) so the
 * mutations are direct memory CRUD — no project-state override machinery.
 */
export function PersonalCategoryBoard({
  projectId,
  items,
  categories = personalCategories,
}: {
  projectId: string;
  items: MemoryItemDto[];
  /** Subset of categories to render as columns (defaults to all seven). */
  categories?: readonly PersonalCategory[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

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
          setStatus(cause instanceof Error ? cause.message : "Request failed.");
        }
      })();
    });
  }

  function addNote(category: PersonalCategory, text: string) {
    const value = text.trim();
    if (!value) return;
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${projectId}/memory`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "note",
            title: null,
            content: value,
            metadata: { personalCategory: category },
            sourceSurface: "web",
          }),
        });
        if (!res.ok) throw new Error("Creation failed.");
      },
      "Adding…",
      "Added.",
    );
  }

  function editNote(item: MemoryItemDto, nextText: string) {
    const value = nextText.trim();
    if (!value) return;
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/memory/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: value }),
        });
        if (!res.ok) throw new Error("Update failed.");
      },
      "Saving…",
      "Saved.",
    );
  }

  function deleteNote(item: MemoryItemDto) {
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/memory/${item.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Removal failed.");
      },
      "Removing…",
      "Removed.",
    );
  }

  // Most-filled + most-recent categories first; empties sink right.
  const orderedCategories = sortPersonalCategoriesByFill(items, categories);

  const columns: BoardColumn[] = orderedCategories.map((category) => {
    const meta = PERSONAL_CATEGORY_META[category];
    const columnItems = items.filter(
      (item) => personalCategoryFromMetadata(item.metadata) === category,
    );
    return {
      key: category,
      label: meta.label,
      color: meta.color,
      emptyHint: `No ${meta.label.toLowerCase()} yet.`,
      addPlaceholder: `Add ${meta.label.toLowerCase()}…`,
      onAdd: (text) => addNote(category, text),
      rows: columnItems.map((item) => ({
        key: item.id,
        text: item.content,
        sourceSurface: item.sourceSurface,
        capturedAt: item.capturedAt ?? item.updatedAt,
        onEdit: (next) => editNote(item, next),
        onDelete: () => deleteNote(item),
      })),
    };
  });

  return (
    <MemoryColumnBoard
      columns={columns}
      layout={columns.length > 1 ? "scroll" : "grid"}
      pending={pending}
      status={status}
    />
  );
}
