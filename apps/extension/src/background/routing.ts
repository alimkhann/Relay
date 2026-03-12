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
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "about",
  "your",
  "have",
  "what",
  "when",
  "where",
  "why",
  "will",
  "just",
  "then",
  "than",
  "them",
  "they",
  "chat",
  "work",
  "page",
  "open"
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

function scoreApprovedAssociation(
  candidate: CandidateScore,
  input: EvaluateProjectRoutingInput,
  association: RelayApprovedAssociation
) {
  if (association.projectId !== candidate.projectId) {
    return
  }

  const page = input.page
  if (association.key && association.key === buildAssociationKey(page)) {
    candidate.score += 90
    candidate.reasons.push("Matched a previously approved chat fingerprint.")
    return
  }

  if (page.pageFingerprint && association.pageFingerprint === page.pageFingerprint) {
    candidate.score += 78
    candidate.reasons.push("Matched an approved chat fingerprint on this platform.")
  } else if (page.url && association.url === page.url) {
    candidate.score += 64
    candidate.reasons.push("Matched an approved chat URL.")
  } else if (page.pathname && association.pathname === page.pathname && association.platform === page.platform) {
    candidate.score += 52
    candidate.reasons.push("Matched a recent approved path on this platform.")
  }

  if (page.domain && association.domain === page.domain && association.platform === page.platform) {
    candidate.score += 18
    candidate.reasons.push("Shares a recent approved domain and platform.")
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
    reasons: []
  }
  const projectTokens = collectProjectTokens(project)
  const titleTokens = uniqueTokens([input.page.title])
  const pathTokens = uniqueTokens([input.page.pathname, input.page.url])
  const userTurnTokens = uniqueTokens([input.page.recentUserTurnText ?? null])

  for (const association of input.approvedAssociations) {
    scoreApprovedAssociation(candidate, input, association)
  }

  if (input.boundProject?.projectId === project.id) {
    if (input.boundProject.bindingKind === "tab") {
      candidate.score += 62
      candidate.reasons.push("This tab is explicitly bound to the project.")
    } else if (input.boundProject.bindingKind === "domain") {
      candidate.score += 26
      candidate.reasons.push("This domain was previously linked to the project.")
    } else {
      candidate.score += 18
      candidate.reasons.push("This project was the last manual Relay choice.")
    }
  }

  if (input.lastTabProjectId === project.id) {
    candidate.score += 18
    candidate.reasons.push("This tab was recently associated with the project.")
  }

  if (input.selectedProjectId === project.id) {
    candidate.score += 10
    candidate.reasons.push("This is the currently selected project.")
  }

  const titleOverlap = overlapCount(projectTokens, titleTokens)
  if (titleOverlap > 0) {
    candidate.score += Math.min(24, titleOverlap * 8)
    candidate.reasons.push("Project name overlaps with the chat title.")
  }

  const pathOverlap = overlapCount(projectTokens, pathTokens)
  if (pathOverlap > 0) {
    candidate.score += Math.min(16, pathOverlap * 6)
    candidate.reasons.push("Project name overlaps with the route or URL.")
  }

  const userTurnOverlap = overlapCount(projectTokens, userTurnTokens)
  if (userTurnOverlap > 0) {
    candidate.score += Math.min(24, userTurnOverlap * 8)
    candidate.reasons.push("The latest user turn mentions the project.")
  }

  if (hasProjectNameMention(project, input.page.title) || hasProjectNameMention(project, input.page.recentUserTurnText)) {
    candidate.score += 12
    candidate.reasons.push("The project name appears verbatim in the current chat.")
  }

  return candidate
}

function resolveConfidence(topScore: number, runnerUpScore: number) {
  if (topScore >= 70 && topScore - runnerUpScore >= 12) {
    return "high" as const
  }

  if (topScore >= 28) {
    return "medium" as const
  }

  return "low" as const
}

export function buildAssociationKey(page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url">) {
  const platform = page.platform ?? "unknown"
  if (page.pageFingerprint) {
    return `${platform}:fingerprint:${page.pageFingerprint}`
  }

  if (page.pathname) {
    return `${platform}:path:${page.pathname}`
  }

  return `${platform}:url:${page.url ?? ""}`
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

  const confidence = resolveConfidence(top.score, runnerUp?.score ?? 0)
  return {
    mode: confidence === "high" ? "auto-save" : confidence === "medium" ? "hold" : "ignore",
    confidence,
    candidateProjectId: confidence === "low" ? null : top.projectId,
    candidateProjectName: confidence === "low" ? null : top.projectName,
    score: top.score,
    reasons: top.reasons.slice(0, 3)
  }
}
