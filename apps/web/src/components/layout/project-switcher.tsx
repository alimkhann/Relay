"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

interface Project {
  id: string;
  name: string;
}

interface ProjectSwitcherProps {
  projects: Project[];
  currentId: string;
}

export function ProjectSwitcher({ projects, currentId }: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = projects.find((p) => p.id === currentId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-left transition-colors",
          "hover:bg-[var(--relay-soft)]"
        )}
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[var(--relay-accent)] text-[var(--relay-accent-text)] text-[10px] font-bold uppercase">
          {current?.name?.[0] ?? "R"}
        </div>
        <span className="flex-1 truncate text-[13px] font-medium text-[var(--relay-ink)]">
          {current?.name ?? "Select project"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--relay-faint)]" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-1 shadow-[var(--relay-shadow-lg)]">
          {projects.map((project) => (
            <button
              key={project.id}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--relay-radius-xs)] px-2.5 py-1.5 text-[13px] transition-colors",
                project.id === currentId
                  ? "bg-[var(--relay-soft)] text-[var(--relay-ink)] font-medium"
                  : "text-[var(--relay-ink-secondary)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
              )}
              onClick={() => {
                router.push(`/dashboard?project=${project.id}`);
                setOpen(false);
              }}
            >
              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--relay-line-strong)] text-[8px] font-bold uppercase text-[var(--relay-ink-secondary)]">
                {project.name[0]}
              </div>
              <span className="flex-1 truncate">{project.name}</span>
              {project.id === currentId && <Check className="h-3 w-3 shrink-0 text-[var(--relay-ink)]" />}
            </button>
          ))}
          <div className="mt-1 border-t border-[var(--relay-line)] pt-1">
            <button
              className="flex w-full items-center gap-2 rounded-[var(--relay-radius-xs)] px-2.5 py-1.5 text-[13px] text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
              onClick={() => {
                router.push("/dashboard");
                setOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New project</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
