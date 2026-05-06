"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type MemoryItemType,
  type ProjectContextItem,
  type ProjectContextSection,
  type ProjectDashboardDto,
} from "@relay/shared";
import { buildProjectContextItems } from "@relay/shared/utils/project-context";
import {
  Pencil,
  Trash2,
  RotateCcw,
  RefreshCw,
  FileDown,
  MessageSquare,
  Database,
  Clock,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { EmptyState } from "@/components/ui/empty-state";
import { relayClientFetch } from "@/lib/telemetry/fetch";

/* ─── Types ─── */

type ContextSection = ProjectContextSection;

type ContextItem = ProjectContextItem;

interface BentoDashboardProps {
  project: { id: string; name: string; description?: string | null };
  dashboard: ProjectDashboardDto;
  statusReady: boolean;
  statusText: string;
}

/* ─── Constants ─── */

const ITEMS_PER_PAGE = 5;

const labelBySection: Record<ContextSection, string> = {
  decision: "Decisions",
  constraint: "Constraints",
  task: "Tasks",
};

const memoryTypeBySection: Record<ContextSection, MemoryItemType> = {
  decision: "decision",
  constraint: "constraint",
  task: "task",
};

const colorBySection: Record<ContextSection, string> = {
  decision: "var(--relay-section-decision)",
  constraint: "var(--relay-section-constraint)",
  task: "var(--relay-section-task)",
};

const hiddenKeyBySection: Record<
  ContextSection,
  "hiddenDecisions" | "hiddenConstraints" | "hiddenOpenTasks"
> = {
  decision: "hiddenDecisions",
  constraint: "hiddenConstraints",
  task: "hiddenOpenTasks",
};

/* ─── Component ─── */

export function BentoDashboard({ project, dashboard, statusReady, statusText }: BentoDashboardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [contextPages, setContextPages] = useState<Record<ContextSection, number>>({
    decision: 0,
    constraint: 0,
    task: 0,
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [drafts, setDrafts] = useState<Record<ContextSection, string>>({
    decision: "",
    constraint: "",
    task: "",
  });

  const sections: ContextSection[] = ["decision", "task", "constraint"];

  /* ─── Mutations ─── */

  function runMutation(action: () => Promise<void>, pendingMsg: string, doneMsg: string) {
    startTransition(() => {
      void (async () => {
        setStatus(pendingMsg);
        try {
          await action();
          setStatus(doneMsg);
          router.refresh();
        } catch (cause) {
          setStatus(cause instanceof Error ? cause.message : "Request failed.");
        }
      })();
    });
  }

  function removeItem(item: ContextItem) {
    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const res = await relayClientFetch(`/api/memory/${item.memoryId}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Removal failed.");
        },
        "Removing…",
        "Removed."
      );
      return;
    }
    const current = dashboard.stateOverrides?.[hiddenKeyBySection[item.section]] ?? [];
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${project.id}/state`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [hiddenKeyBySection[item.section]]: [...new Set([...current, item.text])] }),
        });
        if (!res.ok) throw new Error("Update failed.");
      },
      "Updating…",
      "Updated."
    );
  }

  function addManualContext(section: ContextSection) {
    const text = drafts[section].trim();
    if (!text) return;
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${project.id}/memory`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: memoryTypeBySection[section], title: null, content: text }),
        });
        if (!res.ok) throw new Error("Creation failed.");
        setDrafts((d) => ({ ...d, [section]: "" }));
      },
      "Adding…",
      "Added."
    );
  }

  function saveEdit(item: ContextItem) {
    const nextText = editingText.trim();
    if (!nextText) return;
    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const res = await relayClientFetch(`/api/memory/${item.memoryId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: nextText }),
          });
          if (!res.ok) throw new Error("Update failed.");
          setEditingKey(null);
          setEditingText("");
        },
        "Saving…",
        "Saved."
      );
      return;
    }
    runMutation(
      async () => {
        const createRes = await relayClientFetch(`/api/projects/${project.id}/memory`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: memoryTypeBySection[item.section], title: null, content: nextText }),
        });
        if (!createRes.ok) throw new Error("Replacement failed.");
        const current = dashboard.stateOverrides?.[hiddenKeyBySection[item.section]] ?? [];
        const hideRes = await relayClientFetch(`/api/projects/${project.id}/state`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [hiddenKeyBySection[item.section]]: [...new Set([...current, item.text])] }),
        });
        if (!hideRes.ok) throw new Error("Failed to hide old item.");
        setEditingKey(null);
        setEditingText("");
      },
      "Replacing…",
      "Replaced."
    );
  }

  function toggleSessionArchive(sessionId: string, archived: boolean) {
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${project.id}/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ archived }),
        });
        if (!res.ok) throw new Error("Session update failed.");
      },
      archived ? "Detaching…" : "Restoring…",
      archived ? "Chat detached." : "Chat restored."
    );
  }

  function regenerateBriefs() {
    const latestPacket = dashboard.packets[0];
    const targetProfileKey = latestPacket?.targetProfileKey ?? "chatgpt_planning";
    const kind = latestPacket?.kind ?? "fresh_chat_bootstrap";
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${project.id}/bootstrap`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetProfileKey, kind, deep: kind === "fresh_chat_bootstrap" }),
        });
        if (!res.ok) throw new Error("Regeneration failed.");
      },
      "Regenerating brief…",
      "Brief regenerated."
    );
  }

  function rebuildState() {
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${project.id}/state`, { method: "POST" });
        if (!res.ok) throw new Error("Rebuild failed.");
      },
      "Rebuilding…",
      "State rebuilt."
    );
  }

  /* ─── Computed ─── */

  const totalChats = dashboard.distinctConversationCount;
  const totalContextItems = sections.reduce((acc, s) => acc + buildProjectContextItems(dashboard, s).length, 0);
  const latestPacket = dashboard.packets[0];

  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <FadeIn>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className={`h-2 w-2 rounded-full ${statusReady ? "bg-emerald-500" : "bg-amber-400"}`}
              />
              <span className="text-[13px] text-[var(--relay-muted)]">{statusText}</span>
            </div>
            {dashboard.projectState?.projectOverview && (
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--relay-ink-secondary)] max-w-2xl">
                {dashboard.projectState.projectOverview}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={rebuildState}
              className="h-7 text-xs gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              Rebuild
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={regenerateBriefs}
              className="h-7 text-xs gap-1.5"
            >
              <Zap className="h-3 w-3" />
              Regenerate
            </Button>
          </div>
        </div>
      </FadeIn>

      {/* ─── Stats strip ─── */}
      <FadeIn delay={0.05}>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Chats", value: totalChats, icon: <MessageSquare className="h-3.5 w-3.5" /> },
            { label: "Context", value: totalContextItems, icon: <Database className="h-3.5 w-3.5" /> },
            {
              label: "Brief",
              value: latestPacket ? "Ready" : "None",
              icon: <FileDown className="h-3.5 w-3.5" />,
            },
            {
              label: "AI budget",
              value: `${dashboard.aiBudget.dailyUserAiUsed}/${dashboard.aiBudget.dailyUserAiLimit}`,
              icon: <Clock className="h-3.5 w-3.5" />,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-2.5 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-3 py-2.5"
            >
              <span className="text-[var(--relay-faint)]">{stat.icon}</span>
              <div>
                <p className="text-sm font-medium text-[var(--relay-ink)] tabular-nums">{stat.value}</p>
                <p className="text-[11px] text-[var(--relay-muted)]">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* ─── Bento grid ─── */}
      <FadeIn delay={0.1}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* ─── Context panel ─── */}
          {sections.map((section) => {
      const items = buildProjectContextItems(dashboard, section);
            const page = contextPages[section];
            const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
            const pageItems = items.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

            return (
              <div
                key={section}
                className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden"
              >
                {/* Panel header */}
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ background: colorBySection[section] }}
                    />
                    <span className="text-xs font-medium text-[var(--relay-ink)]">
                      {labelBySection[section]}
                    </span>
                    <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">{items.length}</span>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        className="p-0.5 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] disabled:opacity-30 transition-colors"
                        disabled={page === 0}
                        aria-label={`Previous ${labelBySection[section]} page`}
                        onClick={() => setContextPages((p) => ({ ...p, [section]: p[section] - 1 }))}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span className="text-[10px] text-[var(--relay-faint)] tabular-nums min-w-[24px] text-center">
                        {page + 1}/{totalPages}
                      </span>
                      <button
                        className="p-0.5 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] disabled:opacity-30 transition-colors"
                        disabled={page >= totalPages - 1}
                        aria-label={`Next ${labelBySection[section]} page`}
                        onClick={() => setContextPages((p) => ({ ...p, [section]: p[section] + 1 }))}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="divide-y divide-[var(--relay-line)]">
                  {pageItems.length === 0 ? (
                    <div className="px-3.5 py-4">
                      <p className="text-[12px] text-[var(--relay-muted)]">
                        No {labelBySection[section].toLowerCase()} yet.
                      </p>
                    </div>
                  ) : (
                    pageItems.map((item) => (
                      <div key={item.key} className="group px-3.5 py-2.5 hover:bg-[var(--relay-soft)]/50 transition-colors">
                        {editingKey === item.key ? (
                          <div className="space-y-2">
                            <textarea
                              className="w-full min-h-[60px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1.5 text-[12px] leading-relaxed outline-none focus:border-[var(--relay-accent)] resize-none"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <Button size="sm" disabled={pending || !editingText.trim()} onClick={() => saveEdit(item)} className="h-6 text-[11px] px-2">
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingKey(null); setEditingText(""); }} className="h-6 text-[11px] px-2">
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)] flex-1">
                              {item.text}
                            </p>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                className="p-1 rounded text-[var(--relay-faint)] hover:text-[var(--relay-ink)] transition-colors"
                                onClick={() => { setEditingKey(item.key); setEditingText(item.text); }}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                className="p-1 rounded text-[var(--relay-faint)] hover:text-[var(--relay-danger)] transition-colors"
                                onClick={() => removeItem(item)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add new */}
                <div className="border-t border-[var(--relay-line)] px-3.5 py-2.5">
                  <div className="flex gap-1.5">
                    <input
                      className="flex-1 min-w-0 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2.5 py-1 text-[12px] outline-none focus:border-[var(--relay-accent)] placeholder:text-[var(--relay-faint)]"
                      placeholder={`Add ${section}…`}
                      value={drafts[section]}
                      onChange={(e) => setDrafts((d) => ({ ...d, [section]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && drafts[section].trim()) addManualContext(section);
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={pending || !drafts[section].trim()}
                      onClick={() => addManualContext(section)}
                      className="h-7 text-[11px] px-2.5 shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </FadeIn>

      {/* ─── Bottom row: Briefs + History ─── */}
      <FadeIn delay={0.15}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* ─── Briefs panel ─── */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <div className="flex items-center gap-2">
                <FileDown className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
                <span className="text-xs font-medium text-[var(--relay-ink)]">Briefs</span>
                <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">{dashboard.packets.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" disabled={pending} onClick={regenerateBriefs} className="h-6 text-[11px] px-2">
                  Regenerate
                </Button>
              </div>
            </div>
            <div className="divide-y divide-[var(--relay-line)] max-h-[200px] overflow-y-auto">
              {dashboard.packets.length === 0 ? (
                <div className="px-3.5 py-6">
                  <EmptyState
                    title="No briefs yet"
                    description="Briefs are generated after your first chat capture."
                    className="py-2"
                  />
                </div>
              ) : (
                dashboard.packets.slice(0, 3).map((packet) => (
                  <div key={packet.id} className="px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-medium text-[var(--relay-ink)]">
                        {packet.targetProfileKey === "chatgpt_planning" ? "ChatGPT" :
                         packet.targetProfileKey === "claude_code_build" ? "Claude" :
                         packet.targetProfileKey === "codex_implementation" ? "Codex" :
                         packet.targetProfileKey === "perplexity_research" ? "Perplexity" :
                         packet.targetProfileKey}
                      </span>
                      <span className="text-[10px] text-[var(--relay-faint)]">
                        {packet.kind === "fresh_chat_bootstrap" ? "Full brief" : "Quick continuity"}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--relay-muted)] line-clamp-2">
                      {packet.content?.slice(0, 150)}…
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ─── History panel ─── */}
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--relay-line)]">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
                <span className="text-xs font-medium text-[var(--relay-ink)]">Chats</span>
                <span className="text-[11px] text-[var(--relay-faint)] tabular-nums">{totalChats}</span>
              </div>
            </div>
            <div className="divide-y divide-[var(--relay-line)] max-h-[200px] overflow-y-auto">
              {dashboard.sessionHistory.length === 0 ? (
                <div className="px-3.5 py-6">
                  <EmptyState
                    title="No chats yet"
                    description="Chats appear here after Relay captures them."
                    className="py-2"
                  />
                </div>
              ) : (
                dashboard.sessionHistory.slice(0, 5).map((session) => (
                  <div
                    key={session.id}
                    className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[var(--relay-soft)]/50 transition-colors ${
                      session.isArchived ? "opacity-50" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-[var(--relay-ink)]">
                        {session.title ?? session.url}
                      </p>
                      <p className="text-[11px] text-[var(--relay-muted)]">
                        {session.platform} · {session.turnCount} turns
                        {session.isArchived ? " · detached" : ""}
                      </p>
                    </div>
                    <button
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={pending}
                      aria-label={session.isArchived ? "Restore chat" : "Detach chat"}
                      onClick={() => toggleSessionArchive(session.id, !session.isArchived)}
                    >
                      {session.isArchived ? (
                        <RotateCcw className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-ink)]" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-[var(--relay-faint)] hover:text-[var(--relay-danger)]" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Status toast */}
      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
