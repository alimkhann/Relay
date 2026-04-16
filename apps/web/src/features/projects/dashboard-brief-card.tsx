"use client";

import Link from "next/link";
import { FileDown } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { ProjectDashboardDto } from "@relay/shared";

// ---------------------------------------------------------------------------

const targetProfileLabels: Record<string, string> = {
  chatgpt_planning: "ChatGPT",
  claude_code_build: "Claude",
  codex_implementation: "Codex",
  perplexity_research: "Perplexity",
};

function kindLabel(kind: string): string {
  return kind === "fresh_chat_bootstrap" ? "Full brief" : "Continuity";
}

// ---------------------------------------------------------------------------

interface DashboardBriefCardProps {
  projectId: string;
  packets: ProjectDashboardDto["packets"];
}

export function DashboardBriefCard({
  projectId,
  packets,
}: DashboardBriefCardProps) {
  const briefUrl = `/brief?project=${projectId}`;

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
        {packets.length > 0 ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {packets.map((packet) => (
                <span
                  key={packet.id}
                  className="text-[10px] text-[var(--relay-faint)] rounded-full bg-[var(--relay-soft)] px-1.5 py-0.5"
                >
                  {targetProfileLabels[packet.targetProfileKey] ??
                    packet.targetProfileKey}
                  {" · "}
                  {kindLabel(packet.kind)}
                </span>
              ))}
            </div>

            {/* Content preview from latest packet */}
            {packets[0]?.content && (
              <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] line-clamp-3">
                {packets[0].content}
              </p>
            )}
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
  );
}
