import { normalizeText } from "./text"

export interface RelayProjectResolutionCandidate {
  id: string
  name: string
  slug?: string | null
  keywords?: string[]
}

export interface RelayProjectResolutionSignals {
  cwdBasename?: string | null
  repoName?: string | null
}

export type RelayProjectResolutionSource =
  | "explicit"
  | "cached"
  | "token"
  | "workspace_match"
  | "single_candidate"

export interface RelayResolvedProject {
  status: "resolved"
  projectId: string
  source: RelayProjectResolutionSource
  confidence: number
  needsUserIntervention: false
}

export interface RelayAmbiguousProjectCandidate {
  id: string
  name: string
  slug: string | null
  keywords: string[]
  score: number
}

export interface RelayAmbiguousProject {
  status: "ambiguous"
  reason: string
  needsUserIntervention: true
  candidates: RelayAmbiguousProjectCandidate[]
}

export type RelayProjectResolutionResult = RelayResolvedProject | RelayAmbiguousProject

function normalizeSignal(value: string | null | undefined) {
  const normalized = normalizeText(value ?? "").toLowerCase()
  if (!normalized) return null
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function scoreCandidate(
  candidate: RelayProjectResolutionCandidate,
  signals: string[],
) {
  const normalizedName = normalizeSignal(candidate.name) ?? ""
  const normalizedSlug = normalizeSignal(candidate.slug ?? null) ?? ""
  const normalizedKeywords = (candidate.keywords ?? [])
    .map((keyword) => normalizeSignal(keyword))
    .filter((keyword): keyword is string => Boolean(keyword))

  let score = 0

  for (const signal of signals) {
    if (!signal) continue

    const directTargets = [normalizedName, normalizedSlug].filter(Boolean)
    for (const target of directTargets) {
      if (signal === target) {
        score += 100
      } else if (target.includes(signal) || signal.includes(target)) {
        score += 60
      }
    }

    for (const keyword of normalizedKeywords) {
      if (signal === keyword) {
        score += 90
      } else if (signal.includes(keyword) || keyword.includes(signal)) {
        score += 45
      }
    }
  }

  return score
}

export function resolveRelayProjectSelection(input: {
  explicitProjectId?: string | null
  cachedProjectId?: string | null
  tokenProjectId?: string | null
  projects: RelayProjectResolutionCandidate[]
  signals?: RelayProjectResolutionSignals
}): RelayProjectResolutionResult {
  const { explicitProjectId, cachedProjectId, tokenProjectId, projects } = input

  if (explicitProjectId && projects.some((project) => project.id === explicitProjectId)) {
    return {
      status: "resolved",
      projectId: explicitProjectId,
      source: "explicit",
      confidence: 1,
      needsUserIntervention: false,
    }
  }

  if (cachedProjectId && projects.some((project) => project.id === cachedProjectId)) {
    return {
      status: "resolved",
      projectId: cachedProjectId,
      source: "cached",
      confidence: 0.99,
      needsUserIntervention: false,
    }
  }

  if (tokenProjectId && projects.some((project) => project.id === tokenProjectId)) {
    return {
      status: "resolved",
      projectId: tokenProjectId,
      source: "token",
      confidence: 1,
      needsUserIntervention: false,
    }
  }

  const signals = [
    normalizeSignal(input.signals?.cwdBasename),
    normalizeSignal(input.signals?.repoName),
  ].filter((value): value is string => Boolean(value))

  if (signals.length > 0) {
    const ranked = projects
      .map((project) => ({
        project,
        score: scoreCandidate(project, signals),
      }))
      .sort((left, right) => right.score - left.score)

    const top = ranked[0]
    const runnerUp = ranked[1]

    if (top && top.score >= 60 && (!runnerUp || top.score - runnerUp.score >= 18)) {
      return {
        status: "resolved",
        projectId: top.project.id,
        source: "workspace_match",
        confidence: Math.min(0.97, Math.max(0.72, top.score / 120)),
        needsUserIntervention: false,
      }
    }

    const candidates = ranked
      .filter((entry) => entry.score > 0)
      .slice(0, 5)
      .map(({ project, score }) => ({
        id: project.id,
        name: project.name,
        slug: project.slug ?? null,
        keywords: project.keywords ?? [],
        score,
      }))

    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        reason: "Multiple Relay projects match the current workspace signals.",
        needsUserIntervention: true,
        candidates,
      }
    }
  }

  if (projects.length === 1) {
    return {
      status: "resolved",
      projectId: projects[0]!.id,
      source: "single_candidate",
      confidence: 0.6,
      needsUserIntervention: false,
    }
  }

  return {
    status: "ambiguous",
    reason: "Relay could not confidently determine the active project.",
    needsUserIntervention: true,
    candidates: projects.slice(0, 5).map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug ?? null,
      keywords: project.keywords ?? [],
      score: 0,
    })),
  }
}
