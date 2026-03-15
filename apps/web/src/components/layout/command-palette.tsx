"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  LayoutDashboard,
  Activity,
  Brain,
  FileDown,
  Settings,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { startWorkspaceNavigation } from "@/components/layout/workspace-cache";

interface CommandAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  section: string;
}

interface CommandPaletteProps {
  projects?: { id: string; name: string }[];
  currentProjectId?: string;
}

export function CommandPalette({ projects = [], currentProjectId }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: CommandAction[] = [
    {
      id: "nav-overview",
      label: "Go to Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
      shortcut: "G O",
      action: () => {
        const href = currentProjectId ? `/dashboard?project=${currentProjectId}` : "/dashboard";
        if (currentProjectId) {
          startWorkspaceNavigation({
            href,
            cacheKey: `dashboard:${currentProjectId}`,
            kind: "dashboard",
            projectId: currentProjectId,
          });
        }
        router.push(href);
      },
      section: "Navigation",
    },
    {
      id: "nav-memory",
      label: "Go to Memory",
      icon: <Brain className="h-4 w-4" />,
      shortcut: "G M",
      action: () => {
        const href = currentProjectId ? `/memory?project=${currentProjectId}` : "/memory";
        if (currentProjectId) {
          startWorkspaceNavigation({
            href,
            cacheKey: `memory:${currentProjectId}`,
            kind: "memory",
            projectId: currentProjectId,
          });
        }
        router.push(href);
      },
      section: "Navigation",
    },
    {
      id: "nav-brief",
      label: "Go to Brief",
      icon: <FileDown className="h-4 w-4" />,
      shortcut: "G B",
      action: () => {
        const href = currentProjectId ? `/brief?project=${currentProjectId}` : "/brief";
        if (currentProjectId) {
          startWorkspaceNavigation({
            href,
            cacheKey: `brief:${currentProjectId}`,
            kind: "brief",
            projectId: currentProjectId,
          });
        }
        router.push(href);
      },
      section: "Navigation",
    },
    {
      id: "nav-activity",
      label: "Go to Activity",
      icon: <Activity className="h-4 w-4" />,
      shortcut: "G A",
      action: () => {
        startWorkspaceNavigation({
          href: "/activity",
          cacheKey: "activity",
          kind: "activity",
        });
        router.push("/activity");
      },
      section: "Navigation",
    },
    {
      id: "nav-settings",
      label: "Go to Settings",
      icon: <Settings className="h-4 w-4" />,
      shortcut: "G S",
      action: () => {
        startWorkspaceNavigation({
          href: "/settings",
          cacheKey: "settings",
          kind: "settings",
        });
        router.push("/settings");
      },
      section: "Navigation",
    },
    {
      id: "action-rebuild",
      label: "Rebuild State",
      icon: <RefreshCw className="h-4 w-4" />,
      action: () => {
        if (currentProjectId) {
          void fetch(`/api/projects/${currentProjectId}/state`, {
            method: "POST",
            credentials: "include",
          }).then(() => router.refresh());
        }
      },
      section: "Actions",
    },
    ...projects
      .filter((p) => p.id !== currentProjectId)
      .map((project) => ({
        id: `project-${project.id}`,
        label: `Switch to ${project.name}`,
        icon: <ArrowRight className="h-4 w-4" />,
        action: () => router.push(`/dashboard?project=${project.id}`),
        section: "Projects",
      })),
  ];

  const filtered = query
    ? actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    : actions;

  const sections = Array.from(new Set(filtered.map((a) => a.section)));

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setSelectedIndex(0);
      }
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setOpen(false);
      }
    },
    [open, filtered, selectedIndex],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="fixed left-1/2 top-[20%] z-[101] w-full max-w-[480px] -translate-x-1/2 rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)] shadow-[var(--relay-shadow-lg)] overflow-hidden"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--relay-line)] px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-[var(--relay-faint)]" />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-[var(--relay-ink)] placeholder:text-[var(--relay-faint)] outline-none"
                placeholder="Search commands..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-[4px] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--relay-faint)]">
                ESC
              </kbd>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-sm text-[var(--relay-muted)]">
                  No results found.
                </p>
              ) : (
                sections.map((section) => {
                  const sectionItems = filtered.filter((a) => a.section === section);
                  return (
                    <div key={section}>
                      <p className="px-3.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--relay-faint)]">
                        {section}
                      </p>
                      {sectionItems.map((item) => {
                        const idx = filtered.indexOf(item);
                        return (
                          <button
                            key={item.id}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors",
                              idx === selectedIndex
                                ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                                : "text-[var(--relay-ink-secondary)] hover:bg-[var(--relay-soft)]"
                            )}
                            onClick={() => {
                              item.action();
                              setOpen(false);
                            }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                          >
                            <span className="shrink-0 text-[var(--relay-faint)]">{item.icon}</span>
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.shortcut && (
                              <kbd className="hidden sm:inline text-[11px] text-[var(--relay-faint)] font-mono">
                                {item.shortcut}
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
