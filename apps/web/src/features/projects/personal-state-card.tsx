"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { relayClientFetch } from "@/lib/telemetry/fetch";

const ABOUT_MAX = 500;
const GOALS_MAX = 320;

/**
 * Overview-tab "About you" card for the PERSONAL project — the personal analogue
 * of the regular DashboardMemoryCard (Project State). The text is auto-generated
 * by the capture/agent/MCP pipeline into project_state and editable here via the
 * shared project-state override route; "Reset to auto" clears the override so the
 * pipeline resumes maintaining it. Override-wins semantics match regular projects.
 */
export function PersonalStateCard({
  projectId,
  overview,
  objective,
  overridden,
  editable = false,
  onSaved,
}: {
  projectId: string;
  overview: string;
  objective: string;
  /** True when a manual override is currently pinning the text. */
  overridden: boolean;
  /** Overview = read-only ("View all" link); memory tab = editable (pencil). */
  editable?: boolean;
  /** Called after a successful save/reset. Memory tab passes a react-query
   * invalidation since router.refresh() doesn't refetch the useMemory hook. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [aboutDraft, setAboutDraft] = useState(overview);
  const [goalsDraft, setGoalsDraft] = useState(objective);
  const [status, setStatus] = useState("");

  const hasContent = Boolean(overview || objective);

  function patch(
    body: Record<string, unknown>,
    pendingMsg: string,
    doneMsg: string,
    onDone?: () => void,
  ) {
    startTransition(() => {
      void (async () => {
        setStatus(pendingMsg);
        try {
          const res = await relayClientFetch(`/api/projects/${projectId}/state`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error("Update failed.");
          setStatus(doneMsg);
          onDone?.();
          router.refresh();
          onSaved?.();
        } catch (cause) {
          setStatus(cause instanceof Error ? cause.message : "Request failed.");
        }
      })();
    });
  }

  function save() {
    patch(
      {
        projectOverviewOverride: aboutDraft.trim() || null,
        currentObjectiveOverride: goalsDraft.trim() || null,
      },
      "Saving…",
      "Saved.",
      () => setEditing(false),
    );
  }

  function resetToAuto() {
    patch(
      { projectOverviewOverride: null, currentObjectiveOverride: null },
      "Resetting…",
      "Reset to auto.",
      () => setEditing(false),
    );
  }

  return (
    <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--relay-ink)]">About you</span>
          {overridden && !editing && (
            <span className="rounded-full bg-[var(--relay-soft)] px-1.5 py-0.5 text-[10px] text-[var(--relay-muted)]">
              edited
            </span>
          )}
        </div>
        {editable ? (
          !editing && (
            <button
              type="button"
              aria-label="Edit"
              title="Edit"
              onClick={() => {
                setAboutDraft(overview);
                setGoalsDraft(objective);
                setEditing(true);
              }}
              className="rounded p-1 text-[var(--relay-faint)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )
        ) : (
          <Link
            href={`/memory?project=${projectId}`}
            className="text-[11px] text-[var(--relay-accent)] hover:underline"
          >
            View all &rarr;
          </Link>
        )}
      </div>

      {/* Body */}
      <div className="px-3.5 py-3 space-y-2.5">
        {editing ? (
          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-medium text-[var(--relay-muted)]">About you</span>
              <textarea
                value={aboutDraft}
                maxLength={ABOUT_MAX}
                onChange={(e) => setAboutDraft(e.target.value)}
                placeholder="A short summary of who you are…"
                className="mt-1 w-full min-h-[72px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                autoFocus
              />
            </div>
            <div>
              <span className="text-[11px] font-medium text-[var(--relay-muted)]">Goals</span>
              <textarea
                value={goalsDraft}
                maxLength={GOALS_MAX}
                onChange={(e) => setGoalsDraft(e.target.value)}
                placeholder="What you're working toward…"
                className="mt-1 w-full min-h-[48px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                disabled={pending}
                onClick={save}
                className="h-6 text-[11px] px-2"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                className="h-6 text-[11px] px-2"
              >
                Cancel
              </Button>
              {overridden && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={resetToAuto}
                  className="ml-auto h-6 text-[11px] px-2 text-[var(--relay-muted)]"
                >
                  Reset to auto
                </Button>
              )}
            </div>
          </div>
        ) : hasContent ? (
          <>
            {overview && (
              <p className="text-[12px] leading-relaxed text-[var(--relay-ink)]">
                {overview}
              </p>
            )}
            {objective && (
              <div>
                <span className="text-[11px] font-medium text-[var(--relay-muted)]">Goals</span>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--relay-ink)]">
                  {objective}
                </p>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title="Nothing here yet"
            description="Relay builds this as you chat about yourself."
            className="py-4"
          />
        )}
      </div>

      {/* Status toast */}
      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
