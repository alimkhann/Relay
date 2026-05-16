"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react"
import type {
  BillingStatusDto,
  ProjectSourceDto,
  SourceChunkRow,
  SourceFactCandidateRow,
  SourceSearchResultDto,
  SourceVersionRow,
} from "@relay/shared"

import { Button } from "@/components/ui/button"
import { FadeIn } from "@/components/ui/fade-in"
import { relayClientFetch } from "@/lib/telemetry/fetch"
import { cn } from "@/lib/cn"

interface SourceDetail {
  source: ProjectSourceDto
  latestVersion: SourceVersionRow | null
  chunks: SourceChunkRow[]
  candidates: SourceFactCandidateRow[]
}

interface SourcesPageContentProps {
  project: { id: string; name: string; description?: string | null }
  initialSources: ProjectSourceDto[]
}

type DetailTab = "overview" | "chunks" | "candidates" | "search"

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function isExternal(source: Pick<ProjectSourceDto, "kind">) {
  return source.kind === "external_docs" || source.kind === "package_docs"
}

function StatusDot({ status }: { status: ProjectSourceDto["status"] }) {
  const map: Record<string, string> = {
    ready: "bg-emerald-500",
    failed: "bg-red-500",
    processing: "bg-amber-500",
    stale: "bg-orange-500",
  }
  const color = map[status] ?? "bg-[var(--relay-muted)]"
  return (
    <span className="relative flex h-2 w-2 shrink-0" title={status} aria-label={status}>
      {status === "processing" && (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color)} />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  )
}

function RailSkeleton() {
  return (
    <div className="space-y-1 px-2 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-2">
          <div className="h-2 w-2 rounded-full bg-[var(--relay-soft)]" />
          <div className="h-3 flex-1 rounded bg-[var(--relay-soft)]" />
        </div>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-5 w-1/3 rounded bg-[var(--relay-soft)]" />
      <div className="h-3 w-1/2 rounded bg-[var(--relay-soft)]" />
      <div className="mt-6 space-y-2">
        <div className="h-3 w-full rounded bg-[var(--relay-soft)]" />
        <div className="h-3 w-11/12 rounded bg-[var(--relay-soft)]" />
        <div className="h-3 w-4/5 rounded bg-[var(--relay-soft)]" />
      </div>
    </div>
  )
}

export function SourcesPageContent({ project, initialSources }: SourcesPageContentProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [sources, setSources] = useState(initialSources)
  const [selectedId, setSelectedId] = useState<string | null>(initialSources[0]?.id ?? null)
  const [detail, setDetail] = useState<SourceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tab, setTab] = useState<DetailTab>("overview")
  const [status, setStatus] = useState("")
  const [externalUrl, setExternalUrl] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SourceSearchResultDto[]>([])
  const [billingStatus, setBillingStatus] = useState<BillingStatusDto | null>(null)
  const [pending, startTransition] = useTransition()

  const fileSources = useMemo(
    () => sources.filter((source) => !isExternal(source)),
    [sources],
  )
  const externalSources = useMemo(
    () => sources.filter((source) => isExternal(source)),
    [sources],
  )
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedId) ?? null,
    [selectedId, sources],
  )
  const hasProcessing = useMemo(
    () => sources.some((source) => source.status === "processing"),
    [sources],
  )

  useEffect(() => {
    if (billingStatus) return
    let cancelled = false
    void relayClientFetch("/api/billing/status", {
      telemetry: { area: "sources", event: "sources.billing_status", context: { projectId: project.id } },
    })
      .then(async (response) => {
        if (!response.ok) return null
        const payload = await response.json() as { billing?: BillingStatusDto }
        return payload.billing ?? null
      })
      .then((payload) => {
        if (!cancelled && payload?.entitlements?.limits && payload.usage) setBillingStatus(payload)
      })
      .catch(() => {
        if (!cancelled) setBillingStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [billingStatus, project.id])

  // Poll while anything is processing so status reflects in real time
  // (processing -> ready/failed) with no spurious error or manual refresh.
  useEffect(() => {
    if (!hasProcessing) return
    let cancelled = false
    const interval = setInterval(() => {
      void (async () => {
        try {
          const response = await relayClientFetch(`/api/projects/${project.id}/sources`, {
            telemetry: { area: "sources", event: "sources.poll", context: { projectId: project.id } },
          })
          if (!response.ok || cancelled) return
          const payload = await response.json() as { sources: ProjectSourceDto[] }
          if (cancelled) return
          setSources(payload.sources)
          const current = selectedId ? payload.sources.find((s) => s.id === selectedId) : null
          if (current && current.status !== "processing" && detail?.source.id === current.id) {
            const detailResponse = await relayClientFetch(`/api/projects/${project.id}/sources/${current.id}`, {
              telemetry: { area: "sources", event: "sources.detail", context: { projectId: project.id, sourceId: current.id } },
            })
            if (!cancelled && detailResponse.ok) setDetail(await detailResponse.json() as SourceDetail)
          }
        } catch {
          // transient; next tick retries
        }
      })()
    }, 2500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [hasProcessing, project.id, selectedId, detail?.source.id])

  async function refreshSources(nextSelectedId = selectedId) {
    const response = await relayClientFetch(`/api/projects/${project.id}/sources`, {
      telemetry: { area: "sources", event: "sources.list", context: { projectId: project.id } },
    })
    if (!response.ok) throw new Error("Unable to refresh sources.")
    const payload = await response.json() as { sources: ProjectSourceDto[] }
    setSources(payload.sources)
    if (nextSelectedId) setSelectedId(nextSelectedId)
  }

  async function loadDetail(sourceId: string) {
    setSelectedId(sourceId)
    setTab("overview")
    setDetailLoading(true)
    try {
      const response = await relayClientFetch(`/api/projects/${project.id}/sources/${sourceId}`, {
        telemetry: { area: "sources", event: "sources.detail", context: { projectId: project.id, sourceId } },
      })
      if (!response.ok) throw new Error("Unable to load source details.")
      setDetail(await response.json() as SourceDetail)
    } finally {
      setDetailLoading(false)
    }
  }

  function upload(file: File | null) {
    if (!file) return
    startTransition(() => {
      void (async () => {
        setStatus("Uploading source…")
        const form = new FormData()
        form.set("file", file)
        const response = await relayClientFetch(`/api/projects/${project.id}/sources`, {
          method: "POST",
          body: form,
          telemetry: { area: "sources", event: "sources.upload", context: { projectId: project.id } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? "Upload failed.")
        }
        const payload = await response.json() as SourceDetail
        setDetail(payload)
        await refreshSources(payload.source.id)
        setStatus(payload.source.status === "processing" ? "Processing source…" : "Source ready.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "Upload failed.")
      }).finally(() => {
        if (inputRef.current) inputRef.current.value = ""
      })
    })
  }

  function indexExternalSource() {
    const url = externalUrl.trim()
    if (!url) return
    startTransition(() => {
      void (async () => {
        setStatus("Indexing external source…")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/external`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
          telemetry: { area: "sources", event: "sources.external.index", context: { projectId: project.id } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? "External source indexing failed.")
        }
        const payload = await response.json() as SourceDetail
        setExternalUrl("")
        setDetail(payload)
        await refreshSources(payload.source.id)
        setStatus(payload.source.status === "processing" ? "Indexing…" : "External source indexed.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "External source indexing failed.")
      })
    })
  }

  function searchExternalSources() {
    const query = searchQuery.trim()
    if (!query) return
    startTransition(() => {
      void (async () => {
        setStatus("Searching external sources…")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/search`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, kinds: ["external_docs", "package_docs"], limit: 12 }),
          telemetry: { area: "sources", event: "sources.external.search", context: { projectId: project.id } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? "External source search failed.")
        }
        const payload = await response.json() as { results: SourceSearchResultDto[] }
        setSearchResults(payload.results)
        setStatus(payload.results.length > 0 ? "Search complete." : "No matching citations found.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "External source search failed.")
      })
    })
  }

  function refreshExternalSource(sourceId: string) {
    const isExternalSrc = sources.find((s) => s.id === sourceId) ? isExternal(sources.find((s) => s.id === sourceId)!) : true
    const noun = isExternalSrc ? "external source" : "file"
    startTransition(() => {
      void (async () => {
        setStatus(isExternalSrc ? "Refreshing external source…" : "Reprocessing file…")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/${sourceId}/reprocess`, {
          method: "POST",
          telemetry: { area: "sources", event: "sources.reprocess", context: { projectId: project.id, sourceId } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? `Could not reprocess ${noun}.`)
        }
        const payload = await response.json() as SourceDetail
        setDetail(payload)
        await refreshSources(sourceId)
        setStatus(isExternalSrc ? "External source refreshed." : "File reprocessed.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : `Could not reprocess ${noun}.`)
      })
    })
  }

  function archiveSource(sourceId: string) {
    startTransition(() => {
      void (async () => {
        setStatus("Archiving source…")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/${sourceId}`, {
          method: "DELETE",
          telemetry: { area: "sources", event: "sources.archive", context: { projectId: project.id, sourceId } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? "Archive failed.")
        }
        setSelectedId(null)
        setDetail(null)
        await refreshSources(null)
        setStatus("Source archived.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "Archive failed.")
      })
    })
  }

  function purgeSource(sourceId: string) {
    if (typeof window !== "undefined" && !window.confirm("Permanently delete this source and its stored file? This cannot be undone.")) {
      return
    }
    startTransition(() => {
      void (async () => {
        setStatus("Deleting source permanently…")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/${sourceId}?purge=1`, {
          method: "DELETE",
          telemetry: { area: "sources", event: "sources.purge", context: { projectId: project.id, sourceId } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? "Delete failed.")
        }
        setSelectedId(null)
        setDetail(null)
        await refreshSources(null)
        setStatus("Source deleted.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "Delete failed.")
      })
    })
  }

  function promoteCitation(result: SourceSearchResultDto) {
    startTransition(() => {
      void (async () => {
        setStatus("Promoting citation to memory…")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/${result.sourceId}/promote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chunkId: result.chunkId,
            type: "note",
            title: result.sourceTitle,
            content: result.content,
          }),
          telemetry: { area: "sources", event: "sources.external.promote", context: { projectId: project.id, sourceId: result.sourceId } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? "Citation promotion failed.")
        }
        setStatus("Citation promoted to memory.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "Citation promotion failed.")
      })
    })
  }

  function reviewCandidate(candidateId: string, action: "promote" | "reject") {
    if (!selectedSource) return
    startTransition(() => {
      void (async () => {
        setStatus(action === "promote" ? "Promoting candidate…" : "Rejecting candidate…")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/${selectedSource.id}/candidates/${candidateId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
          telemetry: { area: "sources", event: "sources.candidate.review", context: { projectId: project.id, sourceId: selectedSource.id, action } },
        })
        if (!response.ok) throw new Error("Candidate review failed.")
        await loadDetail(selectedSource.id)
        await refreshSources(selectedSource.id)
        setStatus(action === "promote" ? "Candidate promoted to memory." : "Candidate rejected.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "Candidate review failed.")
      })
    })
  }

  const activeDetail = detail?.source.id === selectedSource?.id ? detail : null
  const selectedExternalMeta = selectedSource?.metadata?.external && typeof selectedSource.metadata.external === "object"
    ? selectedSource.metadata.external as Record<string, unknown>
    : null
  const selectedIsExternal = selectedSource ? isExternal(selectedSource) : false

  function selectSource(id: string) {
    void loadDetail(id).catch((cause) =>
      setStatus(cause instanceof Error ? cause.message : "Unable to load source."),
    )
  }

  function renderRailGroup(label: string, list: ProjectSourceDto[], emptyHint: string) {
    return (
      <div>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--relay-surface)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--relay-faint)]">
          <span>{label}</span>
          <span className="tabular-nums">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <p className="px-3 pb-3 text-[12px] leading-relaxed text-[var(--relay-muted)]">{emptyHint}</p>
        ) : (
          <ul className="pb-1">
            {list.map((source) => (
              <li key={source.id}>
                <button
                  type="button"
                  onClick={() => selectSource(source.id)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                    selectedId === source.id
                      ? "bg-[var(--relay-soft)]"
                      : "hover:bg-[var(--relay-soft)]/50",
                  )}
                >
                  <StatusDot status={source.status} />
                  {isExternal(source)
                    ? <Globe2 className="h-3.5 w-3.5 shrink-0 text-[var(--relay-muted)]" />
                    : <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--relay-muted)]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--relay-ink)]">
                      {source.displayName}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--relay-muted)]">
                      {formatBytes(source.byteSize)} · {source.status}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-6">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">Sources</h1>
            <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
              Files and external docs Relay can search, cite, and promote into memory.
            </p>
          </div>
          {status && (
            <p
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--relay-muted)]"
              role="status"
            >
              {(pending || hasProcessing) && <Loader2 className="h-3 w-3 animate-spin" />}
              {status}
            </p>
          )}
        </div>
      </FadeIn>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        {/* ── Left rail ── */}
        <FadeIn delay={0.04}>
          <div className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            <div className="space-y-2 border-b border-[var(--relay-line)] p-2.5">
              <input
                ref={inputRef}
                type="file"
                accept=".md,.txt,.csv,.tsv,.docx,.xlsx,.pdf"
                className="hidden"
                onChange={(event) => upload(event.currentTarget.files?.[0] ?? null)}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => inputRef.current?.click()}
                className="h-8 w-full justify-start gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload file
              </Button>
              <div className="flex gap-1.5">
                <input
                  value={externalUrl}
                  onChange={(event) => setExternalUrl(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") indexExternalSource()
                  }}
                  placeholder="Add URL to index…"
                  className="h-8 min-w-0 flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-2.5 text-[12px] text-[var(--relay-ink)] outline-none focus:border-[var(--relay-accent)]"
                />
                <Button
                  size="sm"
                  disabled={pending || !externalUrl.trim()}
                  onClick={indexExternalSource}
                  className="h-8 px-2"
                  aria-label="Index external source"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {sources.length === 0 && pending ? (
                <RailSkeleton />
              ) : (
                <>
                  {renderRailGroup("Files", fileSources, "Upload a file to build project knowledge from documents.")}
                  <div className="border-t border-[var(--relay-line)]" />
                  {renderRailGroup("External", externalSources, "Index a public docs or research URL to make it searchable.")}
                </>
              )}
            </div>
          </div>
        </FadeIn>

        {/* ── Right detail pane ── */}
        <FadeIn delay={0.08}>
          <div className="flex min-h-[460px] flex-col overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            {!selectedSource ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <FileText className="h-8 w-8 text-[var(--relay-faint)]" />
                <p className="text-[13px] text-[var(--relay-muted)]">
                  Select a source to inspect its extraction, chunks, and candidate memory.
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--relay-line)] px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot status={selectedSource.status} />
                      <p className="truncate text-sm font-semibold text-[var(--relay-ink)]">
                        {selectedSource.displayName}
                      </p>
                    </div>
                    <p className="mt-1 text-[12px] text-[var(--relay-muted)]">
                      {selectedSource.mimeType ?? "source"} · {formatBytes(selectedSource.byteSize)} · {selectedSource.status}
                      {selectedSource.sourceUri ? (
                        <>
                          {" · "}
                          <a
                            className="inline-flex items-center gap-1 hover:text-[var(--relay-ink)]"
                            href={selectedSource.sourceUri}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      ) : null}
                    </p>
                    {selectedExternalMeta ? (
                      <p className="mt-1 text-[11px] text-[var(--relay-faint)]">
                        {String(selectedExternalMeta.provider ?? "relay")} · {String(selectedExternalMeta.sourceType ?? "website")} · refresh {String(selectedExternalMeta.refreshPolicy ?? "manual")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || detailLoading}
                      onClick={() => selectSource(selectedSource.id)}
                      className="h-8 gap-2"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", detailLoading && "animate-spin")} />
                      Reload
                    </Button>
                    {selectedIsExternal ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => refreshExternalSource(selectedSource.id)}
                        className="h-8 gap-2"
                      >
                        <Globe2 className="h-3.5 w-3.5" />
                        Refresh
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => refreshExternalSource(selectedSource.id)}
                        className="h-8 gap-2"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reprocess
                      </Button>
                    )}
                    {selectedSource.status === "archived" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => purgeSource(selectedSource.id)}
                        className="h-8 gap-2 text-[var(--relay-danger,#dc2626)] hover:text-[var(--relay-danger,#dc2626)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete permanently
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => archiveSource(selectedSource.id)}
                        className="h-8 gap-2"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-[var(--relay-line)] px-3">
                  {([
                    ["overview", "Overview"],
                    ["chunks", "Chunks"],
                    ["candidates", "Candidates"],
                    ...(selectedIsExternal ? [["search", "Search"] as const] : []),
                  ] as Array<[DetailTab, string]>).map(([key, labelText]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      className={cn(
                        "relative px-3 py-2.5 text-[12px] font-medium transition-colors",
                        tab === key
                          ? "text-[var(--relay-ink)]"
                          : "text-[var(--relay-muted)] hover:text-[var(--relay-ink)]",
                      )}
                    >
                      {labelText}
                      {tab === key && (
                        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--relay-accent)]" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {detailLoading ? (
                    <DetailSkeleton />
                  ) : tab === "overview" ? (
                    <div className="space-y-3 text-[13px] text-[var(--relay-ink-secondary)]">
                      {selectedSource.status === "processing" ? (
                        <div className="flex items-center gap-2 rounded-[var(--relay-radius-sm)] border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-600">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Processing this source — chunks and candidates appear when ready.
                        </div>
                      ) : null}
                      {activeDetail?.latestVersion ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <Stat label="Chunks" value={activeDetail.latestVersion.chunkCount.toLocaleString("en-US")} />
                          <Stat label="Est. tokens" value={activeDetail.latestVersion.tokenEstimate.toLocaleString("en-US")} />
                          <Stat label="Candidates" value={String(activeDetail.candidates.length)} />
                        </div>
                      ) : (
                        <p className="text-[var(--relay-muted)]">No extracted version yet.</p>
                      )}
                      {activeDetail?.latestVersion?.errorMessage ? (
                        <p className="rounded-[var(--relay-radius-sm)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-600">
                          {activeDetail.latestVersion.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  ) : tab === "chunks" ? (
                    <div className="space-y-2">
                      {(activeDetail?.chunks ?? []).length === 0 ? (
                        <Empty hint="No chunks extracted yet." />
                      ) : activeDetail!.chunks.map((chunk) => (
                        <div
                          key={chunk.id}
                          className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-2.5"
                        >
                          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--relay-ink-secondary)]">
                            {chunk.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : tab === "candidates" ? (
                    <div className="space-y-2">
                      {(activeDetail?.candidates ?? []).length === 0 ? (
                        <Empty hint="No candidate memory extracted yet." />
                      ) : activeDetail!.candidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase text-[var(--relay-muted)]">
                              {candidate.type} · {Math.round(candidate.confidence * 100)}%
                            </span>
                            <span className="text-[11px] text-[var(--relay-muted)]">{candidate.status}</span>
                          </div>
                          <p className="text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">
                            {candidate.content}
                          </p>
                          {candidate.status === "pending" ? (
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => reviewCandidate(candidate.id, "promote")}
                                className="h-7 gap-1.5 text-[11px]"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Promote
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => reviewCandidate(candidate.id, "reject")}
                                className="h-7 gap-1.5 text-[11px]"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-1.5">
                        <input
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") searchExternalSources()
                          }}
                          placeholder="Search citations across external sources"
                          className="h-9 min-w-0 flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 text-[13px] text-[var(--relay-ink)] outline-none focus:border-[var(--relay-accent)]"
                        />
                        <Button
                          size="sm"
                          disabled={pending || !searchQuery.trim()}
                          onClick={searchExternalSources}
                          className="h-9 gap-2"
                        >
                          <Search className="h-3.5 w-3.5" />
                          Search
                        </Button>
                      </div>
                      {searchResults.length === 0 ? (
                        <Empty hint="Search to inspect cited passages, then promote the useful ones." />
                      ) : searchResults.map((result) => (
                        <div
                          key={`${result.sourceId}:${result.chunkId}`}
                          className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] font-medium uppercase text-[var(--relay-muted)]">
                              {result.sourceTitle} · {Math.round(result.score * 100)}%
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => promoteCitation(result)}
                              className="h-7 gap-1.5 text-[11px]"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Promote
                            </Button>
                          </div>
                          <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">
                            {result.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {billingStatus && selectedIsExternal ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--relay-line)] px-5 py-2.5 text-[11px] text-[var(--relay-faint)]">
                    <span>Sources {externalSources.length}/{billingStatus.entitlements.limits.externalSourcesPerProject}</span>
                    <span>Indexes {billingStatus.usage.externalSourceIndexesToday}/{billingStatus.entitlements.limits.externalSourceIndexesDaily}</span>
                    <span>Searches {billingStatus.usage.externalSourceSearchesToday}/{billingStatus.entitlements.limits.externalSourceSearchesDaily}</span>
                    <span>Refreshes {billingStatus.usage.externalSourceRefreshesToday}/{billingStatus.entitlements.limits.externalSourceRefreshesDaily}</span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-[var(--relay-faint)]">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--relay-ink)]">{value}</p>
    </div>
  )
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="rounded-[var(--relay-radius-sm)] border border-dashed border-[var(--relay-line)] px-3 py-8 text-center text-[12px] text-[var(--relay-muted)]">
      {hint}
    </div>
  )
}
