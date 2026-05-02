"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface GroupedSession {
  conversationId: string;
  platform: string;
  title: string | null;
  url: string;
  captureCount: number;
  totalTurns: number;
  lastCapturedAt: string;
}

interface DashboardActivityCardProps {
  sessions: GroupedSession[];
  totalChats: number;
}

const platformLabels: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
  codex: "Codex",
  claude_code: "Claude Code",
};

const platformColors: Record<string, string> = {
  chatgpt: "#10a37f",
  claude: "#d97706",
  perplexity: "#22a2f2",
  gemini: "#4285f4",
  grok: "#000",
  deepseek: "#4f6cf7",
  codex: "#10a37f",
  claude_code: "#d97706",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function DashboardActivityCard({ sessions, totalChats }: DashboardActivityCardProps) {
  const items = sessions.slice(0, 5);

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--relay-muted)]" />
          <span className="text-sm font-medium text-[var(--relay-ink)]">Recent Activity</span>
          <span className="rounded-full bg-[var(--relay-line)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--relay-muted)]">
            {totalChats}
          </span>
        </div>
        <Link
          href="/activity"
          className="text-[13px] text-[var(--relay-accent)] hover:underline"
        >
          View all &rarr;
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="No activity yet"
          description="Conversations captured by the extension will appear here."
        />
      ) : (
        <div className="divide-y divide-[var(--relay-line)]">
          {items.map((session) => (
            <div
              key={session.conversationId}
              className="flex items-center gap-2.5 px-3.5 py-2.5"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: platformColors[session.platform] ?? "var(--relay-muted)" }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--relay-ink)]">
                {session.title ?? "Untitled conversation"}
              </span>
              <span className="shrink-0 text-[12px] text-[var(--relay-muted)] whitespace-nowrap">
                {platformLabels[session.platform] ?? session.platform}
                {" · "}
                {session.captureCount} capture{session.captureCount !== 1 ? "s" : ""}
                {" · "}
                {session.totalTurns} turn{session.totalTurns !== 1 ? "s" : ""}
                {" · "}
                {relativeTime(session.lastCapturedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
