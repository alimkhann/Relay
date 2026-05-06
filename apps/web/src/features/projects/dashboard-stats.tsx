"use client";

import { MessageSquare, Database, FileText } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------

interface DashboardStatsProps {
  totalChats: number;
  totalContextItems: number;
  briefStatus: "ready" | "stale" | "none";
  briefGeneratedAt?: string | null;
}

// ---------------------------------------------------------------------------

const briefDisplayMap = {
  ready: { label: "Ready", className: "text-emerald-500" },
  stale: { label: "Stale", className: "text-amber-500" },
  none: { label: "None", className: "text-[var(--relay-muted)]" },
} as const;

function formatTimeAgo(iso: string): string {
  const hours = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000),
  );
  if (hours < 1) return "generated just now";
  if (hours === 1) return "generated 1h ago";
  return `generated ${hours}h ago`;
}

// ---------------------------------------------------------------------------

export function DashboardStats({
  totalChats,
  totalContextItems,
  briefStatus,
  briefGeneratedAt,
}: DashboardStatsProps) {
  const brief = briefDisplayMap[briefStatus];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {/* ---- Chats ---- */}
      <div className="border border-[var(--relay-line)] rounded-lg p-4 bg-[var(--relay-surface)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--relay-muted)]/10">
            <MessageSquare className="h-4 w-4 text-[var(--relay-muted)]" />
          </div>
          <div>
            <p className="text-2xl font-semibold font-mono tabular-nums leading-none">
              {totalChats}
            </p>
            <p className="text-sm leading-snug mt-1">Chat sessions</p>
            <p className="text-xs text-[var(--relay-muted)]">
              across all platforms
            </p>
          </div>
        </div>
      </div>

      {/* ---- Memory ---- */}
      <div className="border border-[var(--relay-line)] rounded-lg p-4 bg-[var(--relay-surface)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--relay-muted)]/10">
            <Database className="h-4 w-4 text-[var(--relay-muted)]" />
          </div>
          <div>
            <p className="text-2xl font-semibold font-mono tabular-nums leading-none">
              {totalContextItems}
            </p>
            <p className="text-sm leading-snug mt-1">Memory items</p>
            <p className="text-xs text-[var(--relay-muted)]">
              decisions &middot; tasks &middot; constraints
            </p>
          </div>
        </div>
      </div>

      {/* ---- Brief ---- */}
      <div className="border border-[var(--relay-line)] rounded-lg p-4 bg-[var(--relay-surface)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--relay-muted)]/10">
            <FileText className="h-4 w-4 text-[var(--relay-muted)]" />
          </div>
          <div>
            <p
              className={cn(
                "text-2xl font-semibold font-mono tabular-nums leading-none",
                brief.className,
              )}
            >
              {brief.label}
            </p>
            <p className="text-sm leading-snug mt-1">Brief status</p>
            <p className="text-xs text-[var(--relay-muted)]">
              {briefGeneratedAt
                ? formatTimeAgo(briefGeneratedAt)
                : "not yet generated"}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
