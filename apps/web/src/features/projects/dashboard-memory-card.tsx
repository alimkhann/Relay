"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface DashboardMemoryCardProps {
  projectId: string;
  overview: string;
  objective: string;
  progress: string;
  editingMemory: boolean;
  setEditingMemory: (editing: boolean) => void;
  onSave: () => void;
  onOverviewChange: (value: string) => void;
  onObjectiveChange: (value: string) => void;
  onProgressChange: (value: string) => void;
  pending: boolean;
}

export function DashboardMemoryCard({
  projectId,
  overview,
  objective,
  progress,
  editingMemory,
  setEditingMemory,
  onSave,
  onOverviewChange,
  onObjectiveChange,
  onProgressChange,
  pending,
}: DashboardMemoryCardProps) {
  const hasContent = !!(overview || objective || progress);

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
        <Link
          href={`/memory?project=${projectId}`}
          className="text-xs font-medium text-[var(--relay-ink)] hover:text-[var(--relay-accent)] transition-colors"
        >
          Memory
        </Link>
        <button
          onClick={() => setEditingMemory(!editingMemory)}
          className="flex items-center gap-1 text-[11px] text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition-colors"
        >
          <Pencil className="h-3 w-3" />
          {editingMemory ? "Cancel" : "Edit"}
        </button>
      </div>

      {/* Body */}
      <div className="px-3.5 py-3 space-y-3">
        {editingMemory ? (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                Overview
              </span>
              <textarea
                className="w-full min-h-[72px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                value={overview}
                onChange={(e) => onOverviewChange(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                Current objective
              </span>
              <textarea
                className="w-full min-h-[72px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                value={objective}
                onChange={(e) => onObjectiveChange(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-[var(--relay-muted)]">
                Recent progress
              </span>
              <textarea
                className="w-full min-h-[72px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                value={progress}
                onChange={(e) => onProgressChange(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              disabled={pending}
              onClick={onSave}
              className="h-7 text-[11px]"
            >
              Save
            </Button>
          </>
        ) : (
          <>
            {hasContent ? (
              <>
                {overview && (
                  <p className="text-[12px] leading-relaxed text-[var(--relay-ink)] line-clamp-3">
                    {overview}
                  </p>
                )}
                {objective && (
                  <p className="text-[11px] text-[var(--relay-muted)] truncate">
                    {objective}
                  </p>
                )}
                <Link
                  href={`/memory?project=${projectId}`}
                  className="inline-block text-[11px] text-[var(--relay-accent)] hover:underline mt-1"
                >
                  View all &rarr;
                </Link>
              </>
            ) : (
              <EmptyState
                title="No memory yet"
                description="Relay will populate this after your first chat."
                className="py-4"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
