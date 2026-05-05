"use client";

import Link from "next/link";
import { FileDown } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { ProjectDashboardDto } from "@relay/shared";

interface DashboardBriefCardProps {
  projectId: string;
  packets: ProjectDashboardDto["packets"];
}

export function DashboardBriefCard({
  projectId,
  packets,
}: DashboardBriefCardProps) {
  const briefUrl = `/brief?project=${projectId}`;
  const latest = packets[0];

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
        <span className="text-xs font-medium text-[var(--relay-ink)]">
          Project Brief
        </span>
        <Link
          href={briefUrl}
          className="text-[11px] text-[var(--relay-accent)] hover:underline"
        >
          View all &rarr;
        </Link>
      </div>

      {/* Body */}
      <div className="px-3.5 py-3">
        {latest?.content ? (
          <Link href={briefUrl} className="block group cursor-pointer">
            <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] line-clamp-[8] group-hover:text-[var(--relay-ink)] transition-colors">
              {latest.content}
            </p>
          </Link>
        ) : (
          <EmptyState
            icon={<FileDown className="h-5 w-5" />}
            title="No briefs yet"
            description="Relay will generate a brief after your first chat capture."
            className="py-6"
          />
        )}
      </div>
    </div>
  );
}
