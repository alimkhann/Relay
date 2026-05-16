"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { Markdown } from "@/components/markdown";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import { formatRelativeTime } from "@/features/activity/activity-feed";
import type { MemoryItemDto } from "@relay/shared";

interface MemoryItemsListProps {
  items: MemoryItemDto[];
  label: string;
  projectId: string;
}

export function MemoryItemsList({ items, label, projectId }: MemoryItemsListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-6 text-center text-[12px] text-[var(--relay-muted)]">
        No {label.toLowerCase()} yet.
      </div>
    );
  }

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      <div className="divide-y divide-[var(--relay-line)]">
        {items.map((item) => (
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
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--relay-faint)]">
              <span className="capitalize">{item.type}</span>
              <span>·</span>
              <time dateTime={item.updatedAt} className="tabular-nums">
                {formatRelativeTime(item.updatedAt)}
              </time>
              {item.decayScore < 0.3 && (
                <>
                  <span>·</span>
                  <span className="text-amber-500">Fading</span>
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
        ))}
      </div>
    </div>
  );
}
