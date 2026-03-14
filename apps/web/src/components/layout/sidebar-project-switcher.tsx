"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Check, Loader2 } from "lucide-react";

import { slugify } from "@relay/shared/utils/text";
import { cn } from "@/lib/cn";
import { createClientFlowId } from "@/lib/telemetry/client";
import { relayClientFetch } from "@/lib/telemetry/fetch";

type Project = { id: string; name: string };

export function SidebarProjectSwitcher({
  projects,
  currentId,
}: {
  projects: Project[];
  currentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [switchPending, startSwitchTransition] = useTransition();
  const [optimisticCurrentId, setOptimisticCurrentId] = useState(currentId);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOptimisticCurrentId(currentId);
    setPendingProjectId(null);
  }, [currentId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current =
    projects.find((p) => p.id === optimisticCurrentId) ?? projects[0];

  async function handleCreate() {
    if (!newName.trim() || newName.trim().length < 2) return;
    setCreatePending(true);
    try {
      const flowId = createClientFlowId("project");
      const slug = slugify(newName.trim()).slice(0, 80);
      const res = await relayClientFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        telemetry: {
          surface: "web-dashboard",
          area: "projects",
          event: "sidebar_switcher.create",
          flowId,
          logSuccess: true,
        },
        body: JSON.stringify({ name: newName.trim(), slug }),
      });
      if (res.ok) {
        const { project } = (await res.json()) as { project: { id: string } };
        setNewName("");
        setCreating(false);
        setOpen(false);
        router.push(`/dashboard?project=${project.id}`);
        router.refresh();
      }
    } finally {
      setCreatePending(false);
    }
  }

  function switchProject(nextProjectId: string) {
    if (
      nextProjectId === optimisticCurrentId ||
      switchPending ||
      createPending ||
      pendingProjectId
    ) {
      return;
    }

    setOptimisticCurrentId(nextProjectId);
    setPendingProjectId(nextProjectId);
    setOpen(false);
    startSwitchTransition(() => {
      router.push(`/dashboard?project=${nextProjectId}`);
      router.refresh();
    });
  }

  return (
    <div className="relative mb-4" ref={ref}>
      <button
        onClick={() => !pendingProjectId && setOpen(!open)}
        disabled={Boolean(pendingProjectId)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          "text-[var(--relay-ink)] hover:bg-[var(--relay-soft)] disabled:cursor-default disabled:opacity-75"
        )}
      >
        <span className="truncate">
          {current?.name ?? "Projects"}
          {pendingProjectId ? " · switching…" : ""}
        </span>
        {pendingProjectId ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--relay-faint)]" />
        ) : (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--relay-faint)] transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-1 shadow-[var(--relay-shadow-lg)]">
          {projects.map((p) => (
            <button
              key={p.id}
              disabled={Boolean(pendingProjectId) || createPending}
              onClick={() => switchProject(p.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-left text-[13px] transition-colors",
                p.id === optimisticCurrentId
                  ? "bg-[var(--relay-soft)] font-medium text-[var(--relay-ink)]"
                  : "text-[var(--relay-ink-secondary)] hover:bg-[var(--relay-soft)]",
                (Boolean(pendingProjectId) || createPending) &&
                  "cursor-default opacity-60"
              )}
            >
              {p.id === optimisticCurrentId && pendingProjectId !== p.id && (
                <Check className="h-3 w-3 shrink-0" />
              )}
              {pendingProjectId === p.id && (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              )}
              <span className="truncate">{p.name}</span>
            </button>
          ))}

          <div className="my-1 border-t border-[var(--relay-line)]" />

          {creating ? (
            <div className="flex items-center gap-1.5 px-1 py-1">
              <input
                autoFocus
                className="flex-1 min-w-0 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2 py-1 text-[12px] outline-none focus:border-[var(--relay-accent)]"
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <button
                disabled={createPending || Boolean(pendingProjectId)}
                onClick={() => void handleCreate()}
                className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent)] px-2 py-1 text-[11px] font-semibold text-[var(--relay-accent-text)] transition hover:opacity-90 disabled:opacity-40"
              >
                {createPending ? "…" : "Add"}
              </button>
            </div>
          ) : (
            <button
              disabled={Boolean(pendingProjectId)}
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[12px] text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            >
              <Plus className="h-3 w-3" />
              New project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
