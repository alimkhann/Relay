"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Pencil, Search, Trash2, X } from "lucide-react"

import type { AssistantChatSummaryDto } from "@relay/shared"

import { cn } from "@/lib/cn"

export function AskRelayHistory({
  open,
  onClose,
  onSelect,
  currentChatId
}: {
  open: boolean
  onClose: () => void
  onSelect: (id: string) => void
  currentChatId: string | null
}) {
  const [chats, setChats] = useState<AssistantChatSummaryDto[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/assistant/chats${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      if (!res.ok) return
      const data = (await res.json()) as { chats: AssistantChatSummaryDto[] }
      setChats(data.chats)
    } catch {
      /* keep stale list */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void load(query.trim()), query ? 250 : 0)
    return () => clearTimeout(t)
  }, [open, query, load])

  if (!open) return null

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
    const ok = typeof window !== "undefined"
      ? window.confirm(`Delete chat "${title || "Untitled"}"? This can't be undone.`)
      : false
    if (!ok) return
    setChats((prev) => prev.filter((c) => c.id !== id))
    await fetch(`/api/assistant/chats/${id}`, { method: "DELETE" }).catch(() => {})
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[var(--relay-bg)]">
      <header className="flex items-center justify-between border-b border-[var(--relay-line)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--relay-ink)]">Your chats</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close history"
          className="rounded-[var(--relay-radius-sm)] p-1.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="border-b border-[var(--relay-line)] p-3">
        <div className="flex items-center gap-2 rounded-[var(--relay-radius)] bg-[var(--relay-soft)] px-3 py-2">
          <Search className="size-4 text-[var(--relay-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 border-0 bg-transparent text-sm text-[var(--relay-ink)] outline-none placeholder:text-[var(--relay-muted)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {chats.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--relay-muted)]">
            {loading ? "Loading…" : "No chats yet."}
          </p>
        ) : (
          chats.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-[var(--relay-radius)] px-2.5 py-2 text-sm",
                c.id === currentChatId
                  ? "bg-[var(--relay-accent-blue-soft)] text-[var(--relay-ink)]"
                  : "text-[var(--relay-ink-secondary)] hover:bg-[var(--relay-soft)]"
              )}
            >
              {editingId === c.id ? (
                <>
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void rename(c.id)}
                    className="flex-1 rounded-[var(--relay-radius-sm)] bg-[var(--relay-surface)] px-2 py-1 text-sm text-[var(--relay-ink)] outline-none ring-1 ring-[var(--relay-accent-blue)]"
                  />
                  <button
                    type="button"
                    onClick={() => void rename(c.id)}
                    aria-label="Save title"
                    className="p-1 text-[var(--relay-accent-blue)]"
                  >
                    <Check className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id)
                      setDraftTitle(c.title)
                    }}
                    aria-label="Rename chat"
                    className="p-1 text-[var(--relay-muted)] opacity-0 transition-opacity hover:text-[var(--relay-ink)] group-hover:opacity-100"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(c.id, c.title)}
                    aria-label="Delete chat"
                    className="p-1 text-[var(--relay-muted)] opacity-0 transition-opacity hover:text-[var(--relay-danger)] group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
