"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { CheckCircle2, ExternalLink, FileText, Globe2, RefreshCw, Search, Upload, XCircle } from "lucide-react"
import type { BillingStatusDto, ProjectSourceDto, SourceChunkRow, SourceFactCandidateRow, SourceSearchResultDto, SourceVersionRow } from "@relay/shared"

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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function statusTone(status: ProjectSourceDto["status"]) {
  if (status === "ready") return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
  if (status === "failed") return "text-red-600 bg-red-500/10 border-red-500/20"
  if (status === "processing") return "text-amber-600 bg-amber-500/10 border-amber-500/20"
  if (status === "stale") return "text-orange-600 bg-orange-500/10 border-orange-500/20"
  return "text-[var(--relay-muted)] bg-[var(--relay-soft)] border-[var(--relay-line)]"
}

export function SourcesPageContent({ project, initialSources }: SourcesPageContentProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [sources, setSources] = useState(initialSources)
  const [section, setSection] = useState<"files" | "external">("files")
  const [selectedId, setSelectedId] = useState(initialSources[0]?.id ?? null)
  const [detail, setDetail] = useState<SourceDetail | null>(null)
  const [status, setStatus] = useState("")
  const [externalUrl, setExternalUrl] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SourceSearchResultDto[]>([])
  const [billingStatus, setBillingStatus] = useState<BillingStatusDto | null>(null)
  const [pending, startTransition] = useTransition()

  const fileSources = useMemo(
    () => sources.filter((source) => source.kind === "uploaded_file" || source.kind === "repo_file"),
    [sources],
  )
  const externalSources = useMemo(
    () => sources.filter((source) => source.kind === "external_docs" || source.kind === "package_docs"),
    [sources],
  )
  const visibleSources = section === "files" ? fileSources : externalSources

  const selectedSource = useMemo(
    () => visibleSources.find((source) => source.id === selectedId) ?? visibleSources[0] ?? null,
    [selectedId, visibleSources],
  )

  useEffect(() => {
    if (section !== "external" || billingStatus) return
    let cancelled = false
    void relayClientFetch("/api/billing/status", {
      telemetry: { area: "sources", event: "sources.external.billing_status", context: { projectId: project.id } },
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
  }, [billingStatus, project.id, section])

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
    const response = await relayClientFetch(`/api/projects/${project.id}/sources/${sourceId}`, {
      telemetry: { area: "sources", event: "sources.detail", context: { projectId: project.id, sourceId } },
    })
    if (!response.ok) throw new Error("Unable to load source details.")
    setDetail(await response.json() as SourceDetail)
  }

  function upload(file: File | null) {
    if (!file) return
    startTransition(() => {
      void (async () => {
        setStatus("Uploading source...")
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
        setStatus("Source imported.")
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
        setStatus("Indexing external source...")
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
        setSection("external")
        await refreshSources(payload.source.id)
        setStatus("External source indexed.")
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
        setStatus("Searching external sources...")
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
        setStatus(payload.results.length > 0 ? "Search complete." : "No matching source citations found.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "External source search failed.")
      })
    })
  }

  function refreshExternalSource(sourceId: string) {
    startTransition(() => {
      void (async () => {
        setStatus("Refreshing external source...")
        const response = await relayClientFetch(`/api/projects/${project.id}/sources/${sourceId}/reprocess`, {
          method: "POST",
          telemetry: { area: "sources", event: "sources.external.refresh", context: { projectId: project.id, sourceId } },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error ?? "External source refresh failed.")
        }
        const payload = await response.json() as SourceDetail
        setDetail(payload)
        await refreshSources(sourceId)
        setStatus("External source refreshed.")
      })().catch((cause) => {
        setStatus(cause instanceof Error ? cause.message : "External source refresh failed.")
      })
    })
  }

  function promoteCitation(result: SourceSearchResultDto) {
    startTransition(() => {
      void (async () => {
        setStatus("Promoting citation to memory...")
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
        setStatus(action === "promote" ? "Promoting candidate..." : "Rejecting candidate...")
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

  return (
    <div className="space-y-6 pt-6">
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">Sources</h1>
            <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
              Project files and external docs that Relay can search, cite, and promote into memory.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".md,.txt,.csv,.tsv,.docx,.xlsx,.pdf"
              className="hidden"
              onChange={(event) => upload(event.currentTarget.files?.[0] ?? null)}
            />
            <Button size="sm" disabled={pending} onClick={() => inputRef.current?.click()} className="h-8 gap-2">
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>
        </div>
      </FadeIn>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={section === "files" ? "default" : "ghost"}
          onClick={() => {
            setSection("files")
            setSelectedId(fileSources[0]?.id ?? null)
          }}
          className="h-8 gap-2"
        >
          <FileText className="h-3.5 w-3.5" />
          Files
          <span className="text-[11px] opacity-70">{fileSources.length}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={section === "external" ? "default" : "ghost"}
          onClick={() => {
            setSection("external")
            setSelectedId(externalSources[0]?.id ?? null)
          }}
          className="h-8 gap-2"
        >
          <Globe2 className="h-3.5 w-3.5" />
          External
          <span className="text-[11px] opacity-70">{externalSources.length}</span>
        </Button>
      </div>

      {status && (
        <p className="text-[12px] text-[var(--relay-muted)]" role="status">{status}</p>
      )}

      {section === "external" ? (
        <FadeIn delay={0.02}>
          <div className="space-y-3 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-[var(--relay-ink)]">Add external source</p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={externalUrl}
                    onChange={(event) => setExternalUrl(event.currentTarget.value)}
                    placeholder="https://arxiv.org/abs/... or https://example.com/docs"
                    className="h-9 min-w-0 flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 text-[13px] text-[var(--relay-ink)] outline-none"
                  />
                  <Button size="sm" disabled={pending || !externalUrl.trim()} onClick={indexExternalSource} className="h-9 gap-2">
                    <Globe2 className="h-3.5 w-3.5" />
                    Index
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--relay-ink)]">Search citations</p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                    placeholder="Find a cited answer across external sources"
                    className="h-9 min-w-0 flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 text-[13px] text-[var(--relay-ink)] outline-none"
                  />
                  <Button size="sm" disabled={pending || !searchQuery.trim()} onClick={searchExternalSources} className="h-9 gap-2">
                    <Search className="h-3.5 w-3.5" />
                    Search
                  </Button>
                </div>
              </div>
            </div>
            {billingStatus ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--relay-line)] pt-3 text-[11px] text-[var(--relay-muted)]">
                <span>External sources {externalSources.length}/{billingStatus.entitlements.limits.externalSourcesPerProject}</span>
                <span>Indexes {billingStatus.usage.externalSourceIndexesToday}/{billingStatus.entitlements.limits.externalSourceIndexesDaily} today</span>
                <span>Searches {billingStatus.usage.externalSourceSearchesToday}/{billingStatus.entitlements.limits.externalSourceSearchesDaily} today</span>
                <span>Refreshes {billingStatus.usage.externalSourceRefreshesToday}/{billingStatus.entitlements.limits.externalSourceRefreshesDaily} today</span>
              </div>
            ) : null}
          </div>
        </FadeIn>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <FadeIn delay={0.04}>
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            <div className="border-b border-[var(--relay-line)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--relay-ink)]">{section === "files" ? "Files" : "External sources"}</p>
            </div>
            <div className="divide-y divide-[var(--relay-line)]">
              {visibleSources.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-[var(--relay-muted)]">
                  {section === "files"
                    ? "Upload files to build project knowledge from documents."
                    : "Index a public docs or research URL to make it searchable."}
                </div>
              ) : visibleSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => void loadDetail(source.id).catch((cause) => setStatus(cause instanceof Error ? cause.message : "Unable to load source."))}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--relay-soft)]",
                    selectedSource?.id === source.id && "bg-[var(--relay-soft)]",
                  )}
                >
                  {source.kind === "external_docs" || source.kind === "package_docs"
                    ? <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--relay-muted)]" />
                    : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--relay-muted)]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--relay-ink)]">{source.displayName}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--relay-muted)]">
                      <span>{formatBytes(source.byteSize)}</span>
                      <span>{source.kind.replace("_", " ")}</span>
                      <span className={cn("rounded-full border px-2 py-0.5", statusTone(source.status))}>{source.status}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.08}>
          <div className="min-h-[420px] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            {!selectedSource ? (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-[13px] text-[var(--relay-muted)]">
                Sources are stored separately from briefs so project context stays compact.
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--relay-line)] px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--relay-ink)]">{selectedSource.displayName}</p>
                    <p className="mt-1 text-[12px] text-[var(--relay-muted)]">
                      {selectedSource.mimeType ?? "source"} · {formatBytes(selectedSource.byteSize)}
                      {selectedSource.sourceUri ? (
                        <>
                          {" · "}
                          <a className="inline-flex items-center gap-1 hover:text-[var(--relay-ink)]" href={selectedSource.sourceUri} target="_blank" rel="noreferrer">
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      ) : null}
                    </p>
                    {selectedExternalMeta ? (
                      <p className="mt-1 text-[11px] text-[var(--relay-muted)]">
                        Provider {String(selectedExternalMeta.provider ?? "relay")} · {String(selectedExternalMeta.sourceType ?? "website")} · refresh {String(selectedExternalMeta.refreshPolicy ?? "manual")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => void loadDetail(selectedSource.id)} className="h-8 gap-2">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Details
                    </Button>
                    {section === "external" ? (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => refreshExternalSource(selectedSource.id)} className="h-8 gap-2">
                        <Globe2 className="h-3.5 w-3.5" />
                        Refresh
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 p-5 xl:grid-cols-2">
                  <section>
                    <p className="mb-2 text-[12px] font-medium text-[var(--relay-muted)]">Extraction</p>
                    <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-3 text-[13px] text-[var(--relay-ink-secondary)]">
                      {activeDetail?.latestVersion ? (
                        <div className="space-y-2">
                          <p>{activeDetail.latestVersion.chunkCount} chunks · {activeDetail.latestVersion.tokenEstimate.toLocaleString("en-US")} estimated tokens</p>
                          {activeDetail.latestVersion.errorMessage ? (
                            <p className="text-red-600">{activeDetail.latestVersion.errorMessage}</p>
                          ) : null}
                        </div>
                      ) : (
                        <p>Open details to inspect chunks and candidate memory.</p>
                      )}
                    </div>
                  </section>

                  {section === "external" ? (
                    <section>
                      <p className="mb-2 text-[12px] font-medium text-[var(--relay-muted)]">Cited search results</p>
                      <div className="space-y-2">
                        {searchResults.length === 0 ? (
                          <div className="rounded-[var(--relay-radius-sm)] border border-dashed border-[var(--relay-line)] px-3 py-6 text-center text-[12px] text-[var(--relay-muted)]">
                            Search external sources to inspect citations.
                          </div>
                        ) : searchResults.map((result) => (
                          <div key={`${result.sourceId}:${result.chunkId}`} className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] font-medium uppercase text-[var(--relay-muted)]">{result.sourceTitle} · {Math.round(result.score * 100)}%</span>
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => promoteCitation(result)} className="h-7 gap-1.5 text-[11px]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Promote
                              </Button>
                            </div>
                            <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">{result.content}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : (
                  <section>
                    <p className="mb-2 text-[12px] font-medium text-[var(--relay-muted)]">Candidate memory</p>
                    <div className="space-y-2">
                      {(activeDetail?.candidates ?? []).length === 0 ? (
                        <div className="rounded-[var(--relay-radius-sm)] border border-dashed border-[var(--relay-line)] px-3 py-6 text-center text-[12px] text-[var(--relay-muted)]">
                          No candidates loaded yet.
                        </div>
                      ) : activeDetail!.candidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase text-[var(--relay-muted)]">{candidate.type} · {Math.round(candidate.confidence * 100)}%</span>
                            <span className="text-[11px] text-[var(--relay-muted)]">{candidate.status}</span>
                          </div>
                          <p className="text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">{candidate.content}</p>
                          {candidate.status === "pending" ? (
                            <div className="mt-3 flex gap-2">
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => reviewCandidate(candidate.id, "promote")} className="h-7 gap-1.5 text-[11px]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Promote
                              </Button>
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => reviewCandidate(candidate.id, "reject")} className="h-7 gap-1.5 text-[11px]">
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                  )}
                </div>
              </div>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  )
}
