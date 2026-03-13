"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2, Check } from "lucide-react";

import { slugify } from "@relay/shared/utils/text";

import { createClientFlowId } from "@/lib/telemetry/client";
import { relayClientFetch } from "@/lib/telemetry/fetch";

type Project = { id: string; name: string };

export function ProjectPicker({
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
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const current = projects.find((p) => p.id === currentId) ?? projects[0];

  async function handleCreate() {
    if (!newName.trim() || newName.trim().length < 2) return;
    setPending(true);
    try {
      const flowId = createClientFlowId("project");
      const slug = slugify(newName.trim()).slice(0, 80);
      const res = await relayClientFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        telemetry: {
          surface: "web-dashboard",
          area: "projects",
          event: "project_picker.create",
          flowId,
          context: {
            source: "project_picker",
          },
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
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Archive this project? You can restore it later.")) return;
    const flowId = createClientFlowId("project");
    await relayClientFetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      telemetry: {
        surface: "web-dashboard",
        area: "projects",
        event: "project_picker.archive",
        flowId,
        context: {
          projectId: id,
        },
        logSuccess: true,
      },
      body: JSON.stringify({ isArchived: true }),
    });
    if (id === currentId) {
      const remaining = projects.filter((p) => p.id !== id);
      router.push(
        remaining.length && remaining[0]
          ? `/dashboard?project=${remaining[0].id}`
          : "/dashboard",
      );
    }
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-[var(--relay-radius-sm)] px-2 py-1 -ml-2 transition hover:bg-[var(--relay-soft)]"
      >
        <h1 className="text-3xl font-bold tracking-tight">
          {current?.name ?? "Projects"}
        </h1>
        <ChevronDown
          className={`h-5 w-5 text-[var(--relay-faint)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-1.5 shadow-[var(--relay-shadow-lg)]">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group flex items-center justify-between rounded-[var(--relay-radius-sm)] px-3 py-2 transition hover:bg-[var(--relay-soft)]"
            >
              <button
                onClick={() => {
                  setOpen(false);
                  if (p.id !== currentId) {
                    router.push(`/dashboard?project=${p.id}`);
                    router.refresh();
                  }
                }}
                className="flex flex-1 items-center gap-2 text-left"
              >
                {p.id === currentId && (
                  <Check className="h-3.5 w-3.5 text-[var(--relay-ink)]" />
                )}
                <span
                  className={`text-sm ${
                    p.id === currentId
                      ? "font-semibold"
                      : "text-[var(--relay-ink-secondary)]"
                  }`}
                >
                  {p.name}
                </span>
              </button>
              {projects.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(p.id);
                  }}
                  className="hidden rounded p-1 text-[var(--relay-faint)] transition hover:bg-red-50 hover:text-red-500 group-hover:block dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          <div className="my-1 border-t border-[var(--relay-line)]" />

          {creating ? (
            <div className="flex items-center gap-2 px-2 py-1">
              <input
                autoFocus
                className="flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--relay-accent)]"
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <button
                disabled={pending}
                onClick={handleCreate}
                className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--relay-accent-text)] transition hover:opacity-90 disabled:opacity-40"
              >
                {pending ? "…" : "Add"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-[var(--relay-radius-sm)] px-3 py-2 text-sm text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
