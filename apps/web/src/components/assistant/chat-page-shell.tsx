"use client"

import { useCallback, useEffect, useState } from "react"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"

import type { AssistantChatSummaryDto } from "@relay/shared"

import { cn } from "@/lib/cn"

import { ChatView } from "./chat-view"

/**
 * Full-bleed /chat page: persistent history sidebar on the left, ChatView on
 * the right. Mirrors the ChatGPT shape — one column for navigation, one for
 * the active conversation.
 */
export function ChatPageShell({
  projectId,
  plan,
  initialChatId
}: {
  projectId: string | null
  plan: "free" | "starter" | "pro"
  initialChatId: string | null
}) {
  const [chats, setChats] = useState<AssistantChatSummaryDto[]>([])
  const [query, setQuery] = useState("")
  // selectedChatId drives ChatView via its initialChatId prop. Setting null
  // and bumping `resetKey` forces a fresh chat on remount.
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId)
  const [resetKey, setResetKey] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")

  const loadChats = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/assistant/chats${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      if (!res.ok) return
      const data = (await res.json()) as { chats: AssistantChatSummaryDto[] }
      setChats(data.chats)
    } catch {
      /* keep stale list */
    }
  }, [])

  const refreshChats = useCallback(() => {
    void loadChats(query.trim())
  }, [loadChats, query])

  useEffect(() => {
    const t = setTimeout(() => void loadChats(query.trim()), query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, loadChats])

  const rename = async (id: string) => {
    const title = draftTitle.trim()
    setEditingId(null)
    if (!title) return
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
    await fetch(`/api/assistant/chats/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title })
    }).catch(() => {})
  }

  const remove = async (id: string, title: string) => {
    // Hard delete — confirm so a stray click doesn't nuke a conversation.
    const ok = typeof window !== "undefined"
      ? window.confirm(`Delete chat "${title || "Untitled"}"? This can't be undone.`)
      : false
    if (!ok) return
    setChats((prev) => prev.filter((c) => c.id !== id))
    if (selectedChatId === id) {
      setSelectedChatId(null)
      setResetKey((k) => k + 1)
    }
    await fetch(`/api/assistant/chats/${id}`, { method: "DELETE" }).catch(() => {})
  }

  return (
    <div className="flex h-full" data-relay-surface="assistant">
      {/* History sidebar */}
      <aside className="flex h-full w-[260px] flex-none flex-col border-r border-[var(--relay-line)] bg-[var(--relay-surface)]">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--relay-line)] px-3 py-2.5">
          <span className="text-sm font-semibold text-[var(--relay-ink)]">Chats</span>
          <button
            type="button"
            onClick={() => {
              setSelectedChatId(null)
              setResetKey((k) => k + 1)
            }}
            aria-label="New chat"
            title="New chat"
            className="rounded-[var(--relay-radius-sm)] p-1.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          >
            <Plus className="size-4" />
          </button>
        </header>

        <div className="border-b border-[var(--relay-line)] p-2">
          <div className="flex items-center gap-2 rounded-[var(--relay-radius)] bg-[var(--relay-soft)] px-2.5 py-1.5">
            <Search className="size-3.5 text-[var(--relay-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full border-0 bg-transparent text-sm text-[var(--relay-ink)] outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-[var(--relay-muted)]"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {chats.length === 0 ? (
            <p className="px-2 py-4 text-xs text-[var(--relay-muted)]">No chats yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((c) => {
                const isActive = c.id === selectedChatId
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-[var(--relay-radius-sm)] px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-[var(--relay-accent-blue-soft)] text-[var(--relay-ink)]"
                        : "text-[var(--relay-ink-secondary)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
                    )}
                  >
                    {editingId === c.id ? (
                      <input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={() => void rename(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void rename(c.id)
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        autoFocus
                        className="w-full border-0 bg-transparent text-sm text-[var(--relay-ink)] outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedChatId(c.id)}
                          className="flex-1 truncate text-left"
                          title={c.title}
                        >
                          {c.title || "New chat"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(c.id)
                            setDraftTitle(c.title)
                          }}
                          aria-label="Rename"
                          className="rounded-[var(--relay-radius-sm)] p-1 text-[var(--relay-muted)] opacity-100 transition-opacity hover:bg-[var(--relay-soft-hover)] hover:text-[var(--relay-ink)] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(c.id, c.title)}
                          aria-label="Delete"
                          className="rounded-[var(--relay-radius-sm)] p-1 text-[var(--relay-muted)] opacity-100 transition-opacity hover:bg-[var(--relay-soft-hover)] hover:text-[var(--relay-danger)] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </nav>
      </aside>

      {/* Active chat */}
      <div className="flex-1 min-w-0">
        <ChatView
          key={`${selectedChatId ?? "new"}-${resetKey}`}
          surface="dashboard"
          projectId={projectId}
          plan={plan}
          variant="page"
          initialChatId={selectedChatId}
          onChatListChanged={refreshChats}
        />
      </div>
    </div>
  )
}
