"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, PinIcon, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import { formatRelativeTime } from "@/features/activity/activity-feed";

import type { NoteDto } from "./notes-selector";

type Variant = "dashboard" | "memory-page";

interface NotesSectionProps {
  notes: NoteDto[];
  variant: Variant;
  projectId: string;
  initialLimit?: number;
}

export function NotesSection({
  notes,
  variant,
  projectId,
  initialLimit = 5,
}: NotesSectionProps) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const total = notes.length;
  const visible =
    variant === "memory-page" && showAll
      ? notes
      : notes.slice(0, initialLimit);
  const hasMore = total > visible.length;

  function deleteNote(id: string) {
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
          // best-effort; router.refresh() won't fire, leave UI intact
        } finally {
          setRemovingId(null);
        }
      })();
    });
  }

  return (
    <section
      id={variant === "memory-page" ? "notes" : undefined}
      className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
    >
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--relay-line)]">
        <div className="flex items-center gap-2">
          <PinIcon className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
          <span className="text-xs font-medium text-[var(--relay-ink)]">
            Pinned notes
          </span>
          {total > 0 && (
            <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">
              {total}
            </span>
          )}
        </div>
        {variant === "dashboard" && hasMore && (
          <Link
            href={`/memory?project=${projectId}#notes`}
            className="text-[11px] text-[var(--relay-faint)] hover:text-[var(--relay-ink)] transition-colors"
          >
            View all {total} →
          </Link>
        )}
        {variant === "memory-page" && total > initialLimit && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] text-[var(--relay-faint)] hover:text-[var(--relay-ink)] transition-colors"
          >
            {showAll ? "Show less" : `Show all ${total}`}
          </button>
        )}
      </header>

      {total === 0 ? (
        <EmptyNotesCard />
      ) : (
        <ul className="divide-y divide-[var(--relay-line)]">
          {visible.map((note) => (
            <li key={note.id}>
              <NoteCard
                note={note}
                onDelete={() => deleteNote(note.id)}
                isRemoving={pending && removingId === note.id}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyNotesCard() {
  return (
    <div className="px-4 py-6 flex items-start gap-3">
      <div className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--relay-soft)]/60">
        <PinIcon className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
      </div>
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-[var(--relay-ink)]">
          No notes yet
        </p>
        <p className="text-[11px] leading-relaxed text-[var(--relay-muted)]">
          Highlight text on any webpage, right-click, and pick{" "}
          <span className="text-[var(--relay-ink)]">Save to Relay</span> to
          pin it here.
        </p>
      </div>
    </div>
  );
}

interface NoteCardProps {
  note: NoteDto;
  onDelete: () => void;
  isRemoving: boolean;
}

function NoteCard({ note, onDelete, isRemoving }: NoteCardProps) {
  return (
    <article
      className={cn(
        "group relative px-4 py-3 hover:bg-[var(--relay-soft)]/50 transition-colors",
        isRemoving && "opacity-50",
      )}
    >
      <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] line-clamp-3 whitespace-pre-wrap">
        {note.content}
      </p>
      <footer className="mt-2 flex items-center gap-2 text-[11px] text-[var(--relay-faint)]">
        {note.sourceUrl && note.hostname ? (
          <SourceChip url={note.sourceUrl} hostname={note.hostname} />
        ) : null}
        {note.sourceUrl && note.hostname ? <span>·</span> : null}
        <time dateTime={note.capturedAt} className="tabular-nums">
          {formatRelativeTime(note.capturedAt)}
        </time>
      </footer>
      <button
        type="button"
        onClick={onDelete}
        disabled={isRemoving}
        aria-label="Delete note"
        className="absolute right-3 top-3 p-1 rounded text-[var(--relay-faint)] opacity-0 group-hover:opacity-100 hover:text-[var(--relay-danger)] transition-all disabled:cursor-not-allowed"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </article>
  );
}

function SourceChip({ url, hostname }: { url: string; hostname: string }) {
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2 py-0.5 text-[10px] text-[var(--relay-muted)] hover:text-[var(--relay-ink)] hover:border-[var(--relay-accent)] transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={favicon}
        alt=""
        width={12}
        height={12}
        className="rounded-sm"
        loading="lazy"
      />
      <span className="truncate max-w-[180px]">{hostname}</span>
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}
