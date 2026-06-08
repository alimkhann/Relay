"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";

import type { SourceSurface } from "@relay/shared";

import { Button } from "@/components/ui/button";
import { ProvenanceChip } from "@/components/memory/provenance-chip";
import { cn } from "@/lib/cn";

/**
 * Presentational column board shared by the project governance board
 * (decisions/tasks/constraints) and the personal Folk-category board. Owns the
 * ephemeral UI state (pagination, edit textarea, add draft, expand) and renders
 * the column chrome + rows identically for every caller. The *mutations* live in
 * the parent — each row/column supplies `onEdit`/`onDelete`/`onAdd` closures, so
 * project-state machinery and plain memory-item CRUD stay isolated while the look
 * cannot drift.
 */

const ITEMS_PER_PAGE = 10;
const COLLAPSED_MAX_HEIGHT = "max-h-24";

export interface BoardRow {
  key: string;
  text: string;
  sourceSurface?: SourceSurface | null;
  sourceUrl?: string | null;
  capturedAt?: string | null;
  derived?: boolean;
  onEdit?: (next: string) => void;
  onDelete?: () => void;
}

export interface BoardColumn {
  key: string;
  label: string;
  /** Color value for the left-edge stripe (CSS var or hex). */
  color: string;
  rows: BoardRow[];
  emptyHint?: string;
  addPlaceholder?: string;
  onAdd?: (text: string) => void;
}

export function MemoryColumnBoard({
  columns,
  layout = "grid",
  pending = false,
  status = "",
}: {
  columns: BoardColumn[];
  /** "grid" wraps (regular project, ≤3 cols); "scroll" keeps all columns on one
   * horizontally-scrollable row (personal, 7 categories). */
  layout?: "grid" | "scroll";
  pending?: boolean;
  status?: string;
}) {
  const [pages, setPages] = useState<Record<string, number>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const containerClass =
    layout === "scroll"
      ? "flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
      : cn(
          "grid gap-3",
          columns.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3",
        );
  const columnClass =
    layout === "scroll" ? "w-[300px] shrink-0" : undefined;

  return (
    <div className="space-y-3">
      <div className={containerClass}>
        {columns.map((column) => {
          const page = pages[column.key] ?? 0;
          const totalPages = Math.max(
            1,
            Math.ceil(column.rows.length / ITEMS_PER_PAGE),
          );
          const safePage = Math.min(page, totalPages - 1);
          const pageRows = column.rows.slice(
            safePage * ITEMS_PER_PAGE,
            (safePage + 1) * ITEMS_PER_PAGE,
          );
          const draft = drafts[column.key] ?? "";

          // Compact pager controls, reused at the top (header) and bottom of the
          // column so long lists can be paged from either end.
          const pagerControls =
            totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="p-0.5 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] disabled:opacity-30 transition-colors"
                  disabled={safePage === 0}
                  aria-label="Previous page"
                  onClick={() =>
                    setPages((p) => ({ ...p, [column.key]: safePage - 1 }))
                  }
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="text-[10px] text-[var(--relay-faint)] tabular-nums min-w-[24px] text-center">
                  {safePage + 1}/{totalPages}
                </span>
                <button
                  type="button"
                  className="p-0.5 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] disabled:opacity-30 transition-colors"
                  disabled={safePage >= totalPages - 1}
                  aria-label="Next page"
                  onClick={() =>
                    setPages((p) => ({ ...p, [column.key]: safePage + 1 }))
                  }
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            ) : null;

          return (
            <div
              key={column.key}
              className={cn(
                "flex flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden",
                columnClass,
              )}
              style={{ borderLeftWidth: 2, borderLeftColor: column.color }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--relay-ink)]">
                    {column.label}
                  </span>
                  <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">
                    {column.rows.length}
                  </span>
                </div>
                {pagerControls}
              </div>

              {/* Rows */}
              <div className="flex-1 divide-y divide-[var(--relay-line)]">
                {pageRows.length === 0 ? (
                  <div className="px-3.5 py-4">
                    <p className="text-[12px] text-[var(--relay-muted)]">
                      {column.emptyHint ??
                        `No ${column.label.toLowerCase()} yet.`}
                    </p>
                  </div>
                ) : (
                  pageRows.map((row) => (
                    <div
                      key={row.key}
                      className="group px-3.5 py-2.5 hover:bg-[var(--relay-soft)]/50 transition-colors"
                    >
                      {editingKey === row.key ? (
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
                              onClick={() => {
                                row.onEdit?.(editingText.trim());
                                setEditingKey(null);
                                setEditingText("");
                              }}
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
                        <div className="min-w-0">
                          <div className="mb-1">
                            <ProvenanceChip
                              sourceSurface={row.sourceSurface ?? null}
                              sourceUrl={row.sourceUrl}
                              capturedAt={row.capturedAt}
                              derived={row.derived}
                            />
                          </div>
                          <ExpandableText text={row.text} />
                          {(row.onEdit || row.onDelete) && (
                            <div className="mt-1.5 flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                              {row.onEdit && (
                                <button
                                  type="button"
                                  aria-label="Edit"
                                  className="rounded p-1.5 text-[var(--relay-faint)] transition-colors hover:text-[var(--relay-ink)] sm:p-1"
                                  onClick={() => {
                                    setEditingKey(row.key);
                                    setEditingText(row.text);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                              {row.onDelete && (
                                <button
                                  type="button"
                                  aria-label="Delete"
                                  className="rounded p-1.5 text-[var(--relay-faint)] transition-colors hover:text-[var(--relay-danger)] sm:p-1"
                                  onClick={() => row.onDelete?.()}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Bottom pager (mirrors the header pager for long lists) */}
              {pagerControls && (
                <div className="flex items-center justify-center border-t border-[var(--relay-line)] px-3.5 py-1.5">
                  {pagerControls}
                </div>
              )}

              {/* Add new */}
              {column.onAdd && (
                <div className="mt-auto border-t border-[var(--relay-line)] bg-[var(--relay-soft)]/40 px-3.5 py-2">
                  <div className="flex gap-1.5">
                    <input
                      className="flex-1 min-w-0 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1 text-[12px] outline-none focus:border-[var(--relay-accent)] placeholder:text-[var(--relay-faint)]"
                      placeholder={
                        column.addPlaceholder ??
                        `Add ${column.label.toLowerCase()}…`
                      }
                      value={draft}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [column.key]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && draft.trim()) {
                          column.onAdd?.(draft.trim());
                          setDrafts((d) => ({ ...d, [column.key]: "" }));
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={pending || !draft.trim()}
                      onClick={() => {
                        column.onAdd?.(draft.trim());
                        setDrafts((d) => ({ ...d, [column.key]: "" }));
                      }}
                      className="h-7 text-[11px] px-2.5 shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}
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

/** Clamps to a few lines and reveals a "Show more" toggle only when the text
 * actually overflows. Keeps short governance lines flush while long personal
 * notes stay expandable. */
function ExpandableText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={cn(
          "text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] whitespace-pre-wrap break-words overflow-hidden",
          !expanded && COLLAPSED_MAX_HEIGHT,
        )}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="mt-0.5 text-[11px] text-[var(--relay-accent-blue)] hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
