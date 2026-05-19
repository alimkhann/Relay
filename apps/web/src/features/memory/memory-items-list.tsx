"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Chrome,
  Globe,
  MessageSquare,
  Plug,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { Markdown } from "@/components/markdown";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import { formatRelativeTime } from "@/features/activity/activity-feed";
import type { MemoryItemDto, SourceSurface } from "@relay/shared";

interface MemoryItemsListProps {
  items: MemoryItemDto[];
  label: string;
  projectId: string;
}

const ORIGIN_META: Record<
  SourceSurface,
  { label: string; Icon: typeof Sparkles }
> = {
  ask_relay: { label: "Ask Relay", Icon: Sparkles },
  extension: { label: "Extension", Icon: Plug },
  chatgpt: { label: "ChatGPT", Icon: MessageSquare },
  claude: { label: "Claude", Icon: MessageSquare },
  gemini: { label: "Gemini", Icon: MessageSquare },
  grok: { label: "Grok", Icon: MessageSquare },
  perplexity: { label: "Perplexity", Icon: MessageSquare },
  deepseek: { label: "DeepSeek", Icon: MessageSquare },
  codex: { label: "Codex", Icon: Terminal },
  mcp: { label: "MCP", Icon: Terminal },
  api: { label: "API", Icon: Boxes },
  web: { label: "Web", Icon: Globe },
};

function OriginBadge({ surface }: { surface: SourceSurface | null }) {
  const meta = surface ? ORIGIN_META[surface] : null;
  const Icon = meta?.Icon ?? Chrome;
  const label = meta?.label ?? "Unknown";
  const isAssistant = surface === "ask_relay";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--relay-radius-sm)] px-1.5 py-0.5 text-[10px] font-medium",
        isAssistant
          ? "bg-[var(--relay-accent-blue-soft)] text-[var(--relay-accent-blue)]"
          : "bg-[var(--relay-soft)] text-[var(--relay-muted)]",
      )}
      title={`Captured via ${label}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export function MemoryItemsList({ items, label, projectId }: MemoryItemsListProps) {
  void projectId;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Newest activity first so the most relevant memory is on top.
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [items],
  );

  function deleteItem(id: string) {
    setRemovingId(id);
    startTransition(() => {
      void (async () => {
        try {
          const res = await relayClientFetch(`/api/memory/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Delete failed.");
          router.refresh();
        } catch {
          // best-effort
        } finally {
          setRemovingId(null);
        }
      })();
    });
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-6 text-center text-[12px] text-[var(--relay-muted)]">
        No {label.toLowerCase()} yet.
      </div>
    );
  }

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      <div className="divide-y divide-[var(--relay-line)]">
        {sorted.map((item) => {
          const created = item.capturedAt ?? item.updatedAt;
          const wasEdited =
            !!item.capturedAt &&
            new Date(item.updatedAt).getTime() - new Date(item.capturedAt).getTime() >
              60_000;
          return (
            <div
              key={item.id}
              className={cn(
                "group relative px-4 py-3 hover:bg-[var(--relay-soft)]/50 transition-colors",
                pending && removingId === item.id && "opacity-50",
              )}
            >
              <Markdown
                content={item.content}
                className="pr-6 text-[12px] leading-relaxed text-[var(--relay-ink-secondary)]"
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--relay-faint)]">
                <span className="capitalize text-[var(--relay-muted)]">{item.type}</span>
                <span>·</span>
                <OriginBadge surface={item.sourceSurface} />
                <span>·</span>
                <span>
                  created{" "}
                  <time dateTime={created} className="tabular-nums">
                    {formatRelativeTime(created)}
                  </time>
                </span>
                {wasEdited && (
                  <>
                    <span>·</span>
                    <span>
                      edited{" "}
                      <time dateTime={item.updatedAt} className="tabular-nums">
                        {formatRelativeTime(item.updatedAt)}
                      </time>
                    </span>
                  </>
                )}
                {item.decayScore < 0.3 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-500">Fading</span>
                  </>
                )}
                {item.sourceUrl && (
                  <>
                    <span>·</span>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--relay-accent-blue)] hover:underline"
                    >
                      source
                    </a>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteItem(item.id)}
                disabled={pending && removingId === item.id}
                aria-label="Delete item"
                className="absolute right-3 top-3 p-1 rounded text-[var(--relay-faint)] opacity-0 group-hover:opacity-100 hover:text-[var(--relay-danger)] transition-all disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
