import { createRepositoryBundle } from "@relay/db"
import type {
  ExternalSourceType,
  ResolveProjectSourcesInput,
  SourceResolutionCandidateDto,
  SourceResolutionResultDto,
} from "@relay/shared"

import { extractManifestDependencies, normalizeExternalSourceUrl } from "./source-ingestion-service"

const EXTERNAL_TOOL_GUIDANCE =
  "No evidence-backed Relay source candidate was found. If this client has Context7 or Nia installed, call those tools for live docs/repo research, then import useful citations into Relay with sources.import."

function includesQuery(text: string | null | undefined, query: string) {
  if (!text) return false
  const normalizedText = text.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).some((part) => normalizedText.includes(part))
}

function sourceTypeFromUrl(url: string): ExternalSourceType {
  const parsed = new URL(url)
  if (parsed.hostname === "github.com") return "github_repo"
  if (parsed.pathname.endsWith("/llms.txt") || parsed.pathname.endsWith("llms.txt")) return "llms_txt"
  if (/openapi\.(json|ya?ml)$/.test(parsed.pathname.toLowerCase())) return "openapi"
  return "website"
}

function normalizeCandidateUrl(value: string): string | null {
  let candidate = value.trim()
  candidate = candidate.replace(/^git\+/, "").replace(/\.git$/i, "")
  if (candidate.startsWith("git://github.com/")) {
    candidate = candidate.replace(/^git:\/\/github\.com\//, "https://github.com/")
  }
  if (candidate.startsWith("github:")) {
    candidate = candidate.replace(/^github:/, "https://github.com/")
  }
  try {
    return normalizeExternalSourceUrl(candidate)
  } catch {
    return null
  }
}

function pushCandidate(
  candidates: SourceResolutionCandidateDto[],
  candidate: SourceResolutionCandidateDto,
) {
  if (candidates.some((existing) => existing.url === candidate.url)) return
  candidates.push(candidate)
}

async function resolveNpmPackage(name: string, fetcher: typeof fetch): Promise<SourceResolutionCandidateDto | null> {
  const response = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`)
  if (!response.ok) return null
  const metadata = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!metadata) return null
  const repository = metadata.repository && typeof metadata.repository === "object"
    ? (metadata.repository as Record<string, unknown>).url
    : metadata.repository
  const rawUrl = typeof metadata.homepage === "string" && metadata.homepage.trim()
    ? metadata.homepage
    : typeof repository === "string"
      ? repository
      : null
  if (!rawUrl) return null
  const url = normalizeCandidateUrl(rawUrl)
  if (!url) return null
  return {
    title: typeof metadata.name === "string" ? metadata.name : name,
    url,
    sourceType: sourceTypeFromUrl(url),
    confidence: 0.78,
    evidence: [
      { type: "package_registry", value: `npm:${name}`, url: `https://registry.npmjs.org/${encodeURIComponent(name)}/latest` },
      { type: url.includes("github.com") ? "repository_metadata" : "package_registry", value: String(rawUrl), url },
    ],
    notes: "Resolved from npm package metadata; Relay did not invent an official docs URL.",
  }
}

export async function resolveProjectSources(
  userId: string,
  projectId: string,
  input: ResolveProjectSourcesInput,
  options: { fetcher?: typeof fetch } = {},
): Promise<SourceResolutionResultDto> {
  const repos = createRepositoryBundle(userId)
  const limit = input.limit ?? 8
  const candidates: SourceResolutionCandidateDto[] = []
  const unresolved = new Set<string>()
  const fetcher = options.fetcher ?? fetch

  const [projectSources, globalSources] = await Promise.all([
    repos.sources.listByProject(projectId),
    repos.sources.searchGlobalSources(input.query, limit).catch(() => []),
  ])

  for (const source of projectSources) {
    if (!source.sourceUri) continue
    if (!includesQuery(source.displayName, input.query) && !includesQuery(source.sourceUri, input.query)) continue
    pushCandidate(candidates, {
      title: source.displayName,
      url: source.sourceUri,
      sourceId: source.id,
      sourceType: sourceTypeFromUrl(source.sourceUri),
      confidence: 0.92,
      evidence: [{ type: "project_source", value: source.id, url: source.sourceUri }],
      notes: "Already indexed in this Relay project.",
    })
  }

  for (const source of globalSources) {
    pushCandidate(candidates, {
      title: source.displayName,
      url: source.canonicalUrl,
      sourceType: sourceTypeFromUrl(source.canonicalUrl),
      confidence: Math.max(0.5, Math.min(0.9, source.trustScore)),
      evidence: [{ type: "global_source", value: source.id, url: source.canonicalUrl }],
      notes: "Available as a shared Relay source candidate.",
    })
  }

  if (input.url) {
    const url = normalizeExternalSourceUrl(input.url)
    pushCandidate(candidates, {
      title: new URL(url).hostname,
      url,
      sourceType: sourceTypeFromUrl(url),
      confidence: 0.82,
      evidence: [{ type: "explicit_url", value: url, url }],
      notes: "Provided explicitly by the caller.",
    })
  }

  if (input.manifestFileName && input.manifestContent) {
    const manifest = extractManifestDependencies(input.manifestFileName, input.manifestContent)
    const relevant = manifest.dependencies
      .filter((dependency) => includesQuery(dependency.name, input.query) || includesQuery(input.query, dependency.name))
      .slice(0, limit)
    for (const dependency of relevant) {
      if ((input.registry ?? "npm") !== "npm") {
        unresolved.add(dependency.name)
        continue
      }
      const candidate = await resolveNpmPackage(dependency.name, fetcher).catch(() => null)
      if (candidate) {
        pushCandidate(candidates, candidate)
      } else {
        unresolved.add(dependency.name)
      }
    }
  }

  const sorted = candidates
    .sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title))
    .slice(0, limit)

  return {
    candidates: sorted,
    unresolved: Array.from(unresolved),
    guidance: sorted.length === 0 || unresolved.size > 0 ? EXTERNAL_TOOL_GUIDANCE : null,
  }
}
