"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/markdown";
import type { ProjectDashboardDto } from "@relay/shared";

interface DashboardBriefCardProps {
  projectId: string;
  packets: ProjectDashboardDto["packets"];
}

export function DashboardBriefCard({
  projectId,
  packets,
}: DashboardBriefCardProps) {
  const router = useRouter();
  const briefUrl = `/brief?project=${projectId}`;
  const latest = packets[0];

  return (
    <div className="flex h-full flex-col rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
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

      {/* Body — absolute scroll layer so the brief never drives the row
          height; the card matches the project-state card and scrolls. */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto px-3.5 py-3">
        {latest?.content ? (
          // Use div+onClick instead of Link to avoid <a> nesting when Markdown has external links.
          <div
            role="link"
            tabIndex={0}
            className="group cursor-pointer"
            onClick={() => router.push(briefUrl)}
            onKeyDown={(e) => { if (e.key === "Enter") router.push(briefUrl) }}
          >
            <Markdown
              content={latest.content}
              className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] transition-colors group-hover:text-[var(--relay-ink)]"
            />
          </div>
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
    </div>
  );
}
