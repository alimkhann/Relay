"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import type { ActivityEntry, GroupedActivityEntry } from "@/server/services/activity-service";

export function formatRelativeTime(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    perplexity: "Perplexity",
    gemini: "Gemini",
    grok: "Grok",
    deepseek: "DeepSeek",
    codex: "Codex",
    claude_code: "Claude Code",
  };
  return map[platform] ?? platform;
}

export function ActivityFeed({ feed }: { feed: ActivityEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  function toggleSessionArchive(
    projectId: string,
    sessionId: string,
    archived: boolean,
  ) {
    startTransition(() => {
      void (async () => {
        setStatus(archived ? "Detaching…" : "Restoring…");
        try {
          const res = await relayClientFetch(
            `/api/projects/${projectId}/sessions/${sessionId}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ archived }),
            },
          );
          if (!res.ok) throw new Error("Session update failed.");
          setStatus(archived ? "Detached." : "Restored.");
          router.refresh();
        } catch (cause) {
          setStatus(
            cause instanceof Error ? cause.message : "Request failed.",
          );
        }
      })();
    });
  }

  if (feed.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <EmptyState
          title="No activity yet"
          description="Activity will appear here after Relay captures chats or runs digests."
        />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
        <div className="divide-y divide-[var(--relay-line)]">
          {feed.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--relay-soft)]/50",
                entry.isArchived && "opacity-50",
              )}
            >
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    entry.kind === "capture"
                      ? "var(--relay-section-decision)"
                      : "var(--relay-section-task)",
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--relay-muted)]">
                    {entry.projectName}
                  </span>
                  <span className="text-[10px] text-[var(--relay-faint)]">
                    {entry.kind === "capture" ? "Capture" : "Digest"}
                  </span>
                </div>
                <p className="truncate text-[13px] text-[var(--relay-ink)]">
                  {entry.title}
                </p>
                <p className="text-[11px] text-[var(--relay-muted)]">
                  {entry.detail}
                </p>
              </div>
              <div className="relative flex items-center shrink-0">
                <span className="tabular-nums text-[11px] text-[var(--relay-faint)] transition-transform duration-150 group-hover:-translate-x-6">
                  {formatRelativeTime(entry.timestamp)}
                </span>
                {entry.kind === "capture" && entry.sessionId && (
                  <button
                    className="absolute right-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    disabled={pending}
                    onClick={() =>
                      toggleSessionArchive(
                        entry.projectId,
                        entry.sessionId!,
                        !entry.isArchived,
                      )
                    }
                  >
                    {entry.isArchived ? (
                      <RotateCcw className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-ink)]" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-danger)]" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </>
  );
}

/**
 * Grouped activity feed - compresses multiple captures from the same conversation.
 * Used for project-specific activity views.
 */
export function GroupedActivityFeed({ feed }: { feed: GroupedActivityEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  function toggleSessionArchive(
    projectId: string,
    sessionId: string,
    archived: boolean,
  ) {
    startTransition(() => {
      void (async () => {
        setStatus(archived ? "Detaching…" : "Restoring…");
        try {
          const res = await relayClientFetch(
            `/api/projects/${projectId}/sessions/${sessionId}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ archived }),
            },
          );
          if (!res.ok) throw new Error("Session update failed.");
          setStatus(archived ? "Detached." : "Restored.");
          router.refresh();
        } catch (cause) {
          setStatus(
            cause instanceof Error ? cause.message : "Request failed.",
          );
        }
      })();
    });
  }

  if (feed.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <EmptyState
          title="No activity yet"
          description="Activity will appear here after Relay captures chats or runs digests."
        />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
        <div className="divide-y divide-[var(--relay-line)]">
          {feed.map((entry, index) => (
            <div
              key={`${entry.groupId}-${index}`}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--relay-soft)]/50",
                entry.allArchived && "opacity-50",
              )}
            >
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    entry.kind === "capture-group"
                      ? "var(--relay-section-decision)"
                      : "var(--relay-section-task)",
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--relay-muted)]">
                    {entry.projectName}
                  </span>
                  <span className="text-[10px] text-[var(--relay-faint)]">
                    {entry.kind === "capture-group"
                      ? platformLabel(entry.platform)
                      : "Digest"}
                  </span>
                  {entry.captureCount > 1 && (
                    <span className="text-[10px] font-medium text-[var(--relay-accent)] bg-[var(--relay-accent)]/10 px-1.5 py-0.5 rounded">
                      {entry.captureCount} captures
                    </span>
                  )}
                </div>
                <p className="truncate text-[13px] text-[var(--relay-ink)]">
                  {entry.title}
                </p>
                <p className="text-[11px] text-[var(--relay-muted)]">
                  {entry.detail}
                </p>
              </div>
              <div className="relative flex items-center shrink-0">
                <span className="tabular-nums text-[11px] text-[var(--relay-faint)] transition-transform duration-150 group-hover:-translate-x-6">
                  {formatRelativeTime(entry.timestamp)}
                </span>
                {entry.kind === "capture-group" && entry.sessionIds[0] && (
                  <button
                    className="absolute right-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    disabled={pending}
                    onClick={() =>
                      toggleSessionArchive(
                        entry.projectId,
                        entry.sessionIds[0]!,
                        !entry.allArchived,
                      )
                    }
                    title={entry.allArchived ? "Restore conversation" : "Detach conversation"}
                  >
                    {entry.allArchived ? (
                      <RotateCcw className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-ink)]" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-danger)]" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </>
  );
}
