import { normalizeText, slugify } from "@relay/shared/utils/text"

import type { RelayPageState, RelayProjectOption } from "../messaging/contracts"
import type { RelayApprovedAssociation } from "../storage/routing"

export interface RelayBoundProjectSignal {
  projectId: string
  bindingKind: "tab" | "domain" | "manual"
}

export interface RelayRoutingDecision {
  mode: "auto-save" | "hold" | "ignore"
  confidence: "high" | "medium" | "low"
  candidateProjectId: string | null
  candidateProjectName: string | null
  score: number
  reasons: string[]
}

interface CandidateScore {
  projectId: string
  projectName: string
  score: number
  reasons: string[]
  phase: "bootstrap" | "context-aware"
  highConfidenceEligible: boolean
  explicitNameSignal: boolean
  bootstrapDescriptionOverlap: number
}

interface EvaluateProjectRoutingInput {
  page: RelayPageState
  projects: RelayProjectOption[]
  selectedProjectId?: string | null
  lastTabProjectId?: string | null
  boundProject?: RelayBoundProjectSignal | null
  approvedAssociations: RelayApprovedAssociation[]
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "build",
  "chat",
  "continue",
  "current",
  "from",
  "have",
  "into",
  "just",
  "more",
  "next",
  "open",
  "page",
  "project",
  "save",
  "that",
  "them",
  "then",
  "they",
  "this",
  "what",
  "when",
  "where",
  "with",
  "work",
  "your"
])

function tokenize(value: string | null | undefined) {
  return normalizeText(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}

function uniqueTokens(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.flatMap((value) => tokenize(value))))
}

function overlapCount(left: string[], right: string[]) {
  const rightSet = new Set(right)
  return left.filter((token) => rightSet.has(token)).length
}

function hasProjectNameMention(project: RelayProjectOption, haystack: string | null | undefined) {
  const normalizedHaystack = normalizeText(haystack ?? "").toLowerCase()
  if (!normalizedHaystack) return false

  const projectName = normalizeText(project.name).toLowerCase()
  if (projectName && normalizedHaystack.includes(projectName)) {
    return true
  }

  const slug = project.slug ? slugify(project.slug) : ""
  return Boolean(slug && normalizedHaystack.includes(slug))
}

function collectProjectTokens(project: RelayProjectOption) {
  return uniqueTokens([project.name, project.slug ?? null])
}

function collectProjectContextTokens(project: RelayProjectOption) {
  return uniqueTokens([
    project.description ?? null,
    ...(project.routingContext?.keywords ?? [])
  ])
}

function collectProjectDescriptionTokens(project: RelayProjectOption) {
  return uniqueTokens([project.description ?? null])
}

function hasMeaningfulProjectContext(project: RelayProjectOption) {
  if (project.routingContext) {
    return project.routingContext.hasMeaningfulContext
  }

  return (project.sessionCount ?? 0) > 0 || (project.memoryCount ?? 0) > 0
}

function pushReason(candidate: CandidateScore, reason: string) {
  if (!candidate.reasons.includes(reason)) {
    candidate.reasons.push(reason)
  }
}

function buildAssociationComparisonKey(page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url">) {
  const platform = page.platform ?? "unknown"
  if (page.pageFingerprint) {
    return `${platform}:fingerprint:${page.pageFingerprint}`
  }

  if (page.pathname) {
    return `${platform}:path:${page.pathname}`
  }

  return `${platform}:url:${page.url ?? ""}`
}

export function buildAssociationKey(page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url">) {
  return buildAssociationComparisonKey(page)
}

export function findApprovedAssociationMatch(
  page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url">,
  approvedAssociations: RelayApprovedAssociation[]
) {
  const exactKey = buildAssociationComparisonKey(page)

  return (
    approvedAssociations.find((association) => association.key === exactKey) ??
    approvedAssociations.find(
      (association) =>
        Boolean(page.pageFingerprint) && association.pageFingerprint === page.pageFingerprint
    ) ??
    approvedAssociations.find((association) => Boolean(page.url) && association.url === page.url) ??
    approvedAssociations.find(
      (association) =>
        Boolean(page.pathname) &&
        Boolean(page.platform) &&
        association.pathname === page.pathname &&
        association.platform === page.platform
    ) ??
    null
  )
}

function scoreApprovedAssociation(
  candidate: CandidateScore,
  input: EvaluateProjectRoutingInput,
  association: RelayApprovedAssociation
) {
  if (association.projectId !== candidate.projectId) {
    return
  }

  const page = input.page
  if (association.key && association.key === buildAssociationComparisonKey(page)) {
    candidate.score += 120
    candidate.highConfidenceEligible = true
    pushReason(candidate, "Matched a previously approved chat fingerprint.")
    return
  }

  if (page.pageFingerprint && association.pageFingerprint === page.pageFingerprint) {
    candidate.score += 100
    candidate.highConfidenceEligible = true
    pushReason(candidate, "Matched an approved chat fingerprint on this platform.")
    return
  }

  if (page.url && association.url === page.url) {
    candidate.score += 84
    candidate.highConfidenceEligible = true
    pushReason(candidate, "Matched an approved chat URL.")
    return
  }

  if (page.pathname && association.pathname === page.pathname && association.platform === page.platform) {
    candidate.score += 58
    pushReason(candidate, "Matched a recent approved path on this platform.")
    return
  }

  if (
    candidate.phase === "context-aware" &&
    page.domain &&
    association.domain === page.domain &&
    association.platform === page.platform
  ) {
    candidate.score += 8
    pushReason(candidate, "Shares a recent approved domain and platform.")
  }
}

function scoreProjectCandidate(
  project: RelayProjectOption,
  input: EvaluateProjectRoutingInput
): CandidateScore {
  const candidate: CandidateScore = {
    projectId: project.id,
    projectName: project.name,
    score: 0,
    reasons: [],
    phase: hasMeaningfulProjectContext(project) ? "context-aware" : "bootstrap",
    highConfidenceEligible: false,
    explicitNameSignal: false,
    bootstrapDescriptionOverlap: 0,
  }
  const projectTokens = collectProjectTokens(project)
  const descriptionTokens = collectProjectDescriptionTokens(project)
  const contextTokens = collectProjectContextTokens(project)
  const titleTokens = uniqueTokens([input.page.title])
  const pathTokens = uniqueTokens([input.page.pathname, input.page.url])
  const userTurnTokens = uniqueTokens([input.page.recentUserTurnText ?? null])

  for (const association of input.approvedAssociations) {
    scoreApprovedAssociation(candidate, input, association)
  }

  const verbatimNameMention =
    hasProjectNameMention(project, input.page.title) ||
    hasProjectNameMention(project, input.page.recentUserTurnText)
  if (verbatimNameMention) {
    candidate.score += candidate.phase === "bootstrap" ? 42 : 34
    candidate.highConfidenceEligible = true
    candidate.explicitNameSignal = true
    pushReason(candidate, "The project name appears verbatim in the current chat.")
  }

  const titleOverlap = overlapCount(projectTokens, titleTokens)
  if (titleOverlap > 0) {
    candidate.score += Math.min(candidate.phase === "bootstrap" ? 42 : 24, titleOverlap * (candidate.phase === "bootstrap" ? 14 : 8))
    if (titleOverlap >= 2) {
      candidate.highConfidenceEligible = true
    }
    candidate.explicitNameSignal = true
    pushReason(candidate, "Project name overlaps with the chat title.")
  }

  const userTurnOverlap = overlapCount(projectTokens, userTurnTokens)
  if (userTurnOverlap > 0) {
    candidate.score += Math.min(candidate.phase === "bootstrap" ? 48 : 28, userTurnOverlap * (candidate.phase === "bootstrap" ? 16 : 10))
    if (userTurnOverlap >= 2) {
      candidate.highConfidenceEligible = true
    }
    candidate.explicitNameSignal = true
    pushReason(candidate, "The latest user turn mentions the project.")
  }

  const pathOverlap = overlapCount(projectTokens, pathTokens)
  if (pathOverlap > 0) {
    candidate.score += Math.min(candidate.phase === "bootstrap" ? 18 : 12, pathOverlap * 6)
    pushReason(candidate, "Project name overlaps with the route or URL.")
  }

  const descriptionTitleOverlap = overlapCount(descriptionTokens, titleTokens)
  if (descriptionTitleOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 26 : 12,
      descriptionTitleOverlap * (candidate.phase === "bootstrap" ? 9 : 4)
    )
    if (
      candidate.phase === "bootstrap"
        ? descriptionTitleOverlap >= 3
        : descriptionTitleOverlap >= 2
    ) {
      candidate.highConfidenceEligible = true
    }
    candidate.bootstrapDescriptionOverlap += descriptionTitleOverlap
    pushReason(candidate, "The project description overlaps with the chat title.")
  }

  const descriptionUserOverlap = overlapCount(descriptionTokens, userTurnTokens)
  if (descriptionUserOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 34 : 16,
      descriptionUserOverlap * (candidate.phase === "bootstrap" ? 10 : 5)
    )
    if (
      candidate.phase === "bootstrap"
        ? descriptionUserOverlap >= 3
        : descriptionUserOverlap >= 2
    ) {
      candidate.highConfidenceEligible = true
    }
    candidate.bootstrapDescriptionOverlap += descriptionUserOverlap
    pushReason(candidate, "The latest user turn overlaps with the project description.")
  }

  const descriptionPathOverlap = overlapCount(descriptionTokens, pathTokens)
  if (descriptionPathOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 10 : 6,
      descriptionPathOverlap * 3
    )
    candidate.bootstrapDescriptionOverlap += descriptionPathOverlap
    pushReason(candidate, "The route overlaps with the project description.")
  }

  const contextTitleOverlap = overlapCount(contextTokens, titleTokens)
  const contextUserOverlap = overlapCount(contextTokens, userTurnTokens)
  const contextPathOverlap = overlapCount(contextTokens, pathTokens)
  const reinforcedByContext =
    candidate.phase === "context-aware" &&
    contextTitleOverlap + contextUserOverlap + contextPathOverlap > 0

  if (candidate.phase === "context-aware" && contextTitleOverlap > 0) {
    candidate.score += Math.min(20, contextTitleOverlap * 5)
    if (contextTitleOverlap >= 2) {
      candidate.highConfidenceEligible = true
    }
    pushReason(candidate, "The chat title overlaps with saved project context.")
  }

  if (candidate.phase === "context-aware" && contextUserOverlap > 0) {
    candidate.score += Math.min(30, contextUserOverlap * 6)
    if (contextUserOverlap >= 2) {
      candidate.highConfidenceEligible = true
    }
    pushReason(candidate, "The latest user turn overlaps with saved project context.")
  }

  if (candidate.phase === "context-aware" && contextPathOverlap > 0) {
    candidate.score += Math.min(10, contextPathOverlap * 4)
    pushReason(candidate, "The route overlaps with saved project context.")
  }

  const allowWeakAffinity = candidate.highConfidenceEligible || reinforcedByContext
  if (input.boundProject?.projectId === project.id && allowWeakAffinity) {
    if (input.boundProject.bindingKind === "tab") {
      candidate.score += 10
      pushReason(candidate, "This tab is already linked to the project.")
    } else if (input.boundProject.bindingKind === "domain") {
      candidate.score += candidate.phase === "context-aware" ? 6 : 3
      pushReason(candidate, "This domain was previously linked to the project.")
    } else {
      candidate.score += 4
      pushReason(candidate, "This project was manually chosen recently.")
    }
  }

  if (input.lastTabProjectId === project.id && allowWeakAffinity) {
    candidate.score += 3
    pushReason(candidate, "This tab was recently associated with the project.")
  }

  if (input.selectedProjectId === project.id && allowWeakAffinity) {
    candidate.score += 2
    pushReason(candidate, "This is the currently selected project.")
  }

  return candidate
}

function resolveConfidence(
  top: CandidateScore,
  runnerUpScore: number,
  input: EvaluateProjectRoutingInput,
) {
  const scoreGap = top.score - runnerUpScore
  const workspaceIsEffectivelySingleProject = input.projects.length === 1
  const preferredProjectMatches =
    input.selectedProjectId === top.projectId ||
    input.boundProject?.projectId === top.projectId
  const strongBootstrapEvidence =
    top.explicitNameSignal || top.bootstrapDescriptionOverlap >= 3

  if (
    top.highConfidenceEligible &&
    top.score >= (top.phase === "bootstrap" ? 70 : 68) &&
    scoreGap >= (top.phase === "bootstrap" ? 18 : 12)
  ) {
    return "high" as const
  }

  if (
    top.phase === "bootstrap" &&
    strongBootstrapEvidence &&
    (workspaceIsEffectivelySingleProject || preferredProjectMatches) &&
    top.score >= 24 &&
    scoreGap >= 6
  ) {
    return "high" as const
  }

  if (top.score >= (top.phase === "bootstrap" ? 30 : 28)) {
    return "medium" as const
  }

  return "low" as const
}

export function evaluateProjectRouting(input: EvaluateProjectRoutingInput): RelayRoutingDecision {
  if (!input.page.supported || input.projects.length === 0) {
    return {
      mode: "ignore",
      confidence: "low",
      candidateProjectId: null,
      candidateProjectName: null,
      score: 0,
      reasons: ["No supported project routing signal was available."]
    }
  }

  const candidates = input.projects
    .map((project) => scoreProjectCandidate(project, input))
    .sort((left, right) => right.score - left.score)

  const top = candidates[0]
  const runnerUp = candidates[1]
  if (!top) {
    return {
      mode: "ignore",
      confidence: "low",
      candidateProjectId: null,
      candidateProjectName: null,
      score: 0,
      reasons: ["No project candidates were available."]
    }
  }

  const confidence = resolveConfidence(top, runnerUp?.score ?? 0, input)

  return {
    mode: confidence === "high" ? "auto-save" : confidence === "medium" ? "hold" : "ignore",
    confidence,
    candidateProjectId: confidence === "low" ? null : top.projectId,
    candidateProjectName: confidence === "low" ? null : top.projectName,
    score: top.score,
    reasons: top.reasons.slice(0, 4)
  }
}
