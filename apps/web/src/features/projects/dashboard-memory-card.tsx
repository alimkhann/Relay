"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

interface DashboardMemoryCardProps {
  projectId: string;
  overview: string;
  objective: string;
  progress: string;
}

export function DashboardMemoryCard({
  projectId,
  overview,
  objective,
  progress,
}: DashboardMemoryCardProps) {
  const hasContent = !!(overview || objective || progress);

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
        <span className="text-xs font-medium text-[var(--relay-ink)]">
          Memory
        </span>
        <Link
          href={`/memory?project=${projectId}`}
          className="text-[11px] text-[var(--relay-accent)] hover:underline"
        >
          View all &rarr;
        </Link>
      </div>

      {/* Body */}
      <div className="px-3.5 py-3 space-y-3">
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
          </>
        ) : (
          <EmptyState
            title="No memory yet"
            description="Relay will populate this after your first chat."
            className="py-4"
          />
        )}
      </div>
    </div>
  );
}
