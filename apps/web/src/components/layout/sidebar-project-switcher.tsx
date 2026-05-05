"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Plus, Check, Loader2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";

import { cn } from "@/lib/cn";
import { CreateProjectForm } from "@/components/projects/create-project-form";

type Project = { id: string; name: string };

export function SidebarProjectSwitcher({
  projects,
  currentId,
  collapsed = false,
}: {
  projects: Project[];
  currentId?: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current =
    projects.find((p) => p.id === optimisticCurrentId) ?? projects[0];

  function switchProject(nextProjectId: string) {
    if (
      nextProjectId === optimisticCurrentId ||
      switchPending ||
      pendingProjectId
    ) {
      return;
    }

    setOptimisticCurrentId(nextProjectId);
    setPendingProjectId(nextProjectId);
    setOpen(false);
    document.cookie = `relay-last-project=${nextProjectId};path=/;max-age=31536000;samesite=lax`;
    startSwitchTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("project", nextProjectId);
      router.push(`${pathname}?${params.toString()}`);
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <div className="mb-4 flex justify-center">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={() => !pendingProjectId && setOpen(!open)}
              disabled={Boolean(pendingProjectId)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-[var(--relay-radius-sm)] text-[11px] font-bold transition-colors",
                "bg-[var(--relay-soft)] text-[var(--relay-ink)] hover:bg-[var(--relay-soft-hover)] disabled:cursor-default disabled:opacity-75",
              )}
            >
              {pendingProjectId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                (current?.name ?? "P").charAt(0).toUpperCase()
              )}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="right"
              sideOffset={8}
              className="z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
            >
              {current?.name ?? "Projects"}
              <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );
  }

  return (
    <div className="relative mb-4" ref={ref}>
      <button
        onClick={() => !pendingProjectId && setOpen(!open)}
        disabled={Boolean(pendingProjectId)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          "text-[var(--relay-ink)] hover:bg-[var(--relay-soft)] disabled:cursor-default disabled:opacity-75",
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
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-1 shadow-[var(--relay-shadow-lg)]">
          {projects.map((p) => (
            <button
              key={p.id}
              disabled={Boolean(pendingProjectId)}
              onClick={() => switchProject(p.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-left text-[13px] transition-colors",
                p.id === optimisticCurrentId
                  ? "bg-[var(--relay-soft)] font-medium text-[var(--relay-ink)]"
                  : "text-[var(--relay-ink-secondary)] hover:bg-[var(--relay-soft)]",
                Boolean(pendingProjectId) && "cursor-default opacity-60",
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

          <button
            disabled={Boolean(pendingProjectId)}
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[12px] text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          >
            <Plus className="h-3 w-3" />
            New project
          </button>
        </div>
      )}

      {/* Create project dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6 shadow-[var(--relay-shadow-lg)]">
            <Dialog.Title className="text-lg font-semibold text-[var(--relay-ink)]">
              New project
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-[13px] text-[var(--relay-muted)]">
              Create a project boundary so Relay can route the right chats.
            </Dialog.Description>
            <div className="mt-5">
              <CreateProjectForm onSuccess={() => setDialogOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
