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
  diagnostics: {
    phase: "bootstrap" | "context-aware" | "none"
    scoreGap: number
    explicitNameSignal: boolean
    wholeChatExactMention: boolean
    highConfidenceEligible: boolean
    signalCategories: Array<"name" | "title" | "description" | "context" | "binding" | "association">
  }
  topCandidates: Array<{
    projectId: string
    projectName: string
    score: number
    reasons: string[]
  }>
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
  wholeChatExactMention: boolean
  domainMatchApplied: boolean
  signalCategories: Set<"name" | "title" | "description" | "context" | "binding" | "association">
}

function getContentSignalCategories(
  categories: Set<"name" | "title" | "description" | "context" | "binding" | "association">
) {
  const contentCategories = new Set(categories)
  contentCategories.delete("binding")
  contentCategories.delete("association")
  return contentCategories
}

function hasNonNameContentSignal(
  categories: Set<"name" | "title" | "description" | "context" | "binding" | "association">
) {
  const contentCategories = getContentSignalCategories(categories)
  contentCategories.delete("name")
  contentCategories.delete("title")
  return contentCategories.size > 0
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
  "best",
  "build",
  "chat",
  "continue",
  "create",
  "current",
  "find",
  "from",
  "get",
  "good",
  "have",
  "help",
  "into",
  "just",
  "like",
  "make",
  "more",
  "need",
  "next",
  "open",
  "page",
  "plan",
  "progress",
  "project",
  "run",
  "save",
  "set",
  "show",
  "start",
  "test",
  "that",
  "them",
  "then",
  "they",
  "this",
  "track",
  "using",
  "want",
  "way",
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
  if (projectName && hasPhraseMention(normalizedHaystack, projectName)) {
    return true
  }

  const slug = project.slug ? slugify(project.slug) : ""
  return Boolean(slug && hasPhraseMention(normalizedHaystack, slug))
}

function hasPhraseMention(normalizedHaystack: string, normalizedNeedle: string) {
  const tokens = normalizedNeedle.split(/[^a-z0-9]+/g).filter(Boolean)
  if (tokens.length === 0) return false
  const pattern = tokens.map(escapeRegExp).join("[^a-z0-9]+")
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(normalizedHaystack)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function samePlatform(
  page: Pick<RelayPageState, "platform">,
  association: RelayApprovedAssociation,
) {
  return Boolean(page.platform) && association.platform === page.platform
}

function hasIncidentalReferenceMention(project: RelayProjectOption, haystack: string | null | undefined) {
  const normalizedHaystack = normalizeText(haystack ?? "").toLowerCase()
  if (!normalizedHaystack || !hasProjectNameMention(project, normalizedHaystack)) {
    return false
  }

  return [
    "for reference",
    "reference point",
    "mentioned",
    "mentioning",
    "compare",
    "comparison",
    "unrelated",
    "not about",
    "just an example",
    "for example",
  ].some((phrase) => normalizedHaystack.includes(phrase))
}

function hasPersonalProfileIntent(haystack: string | null | undefined) {
  const normalizedHaystack = normalizeText(haystack ?? "").toLowerCase()
  if (!normalizedHaystack) return false

  return [
    "about me",
    "know about me",
    "what you know about me",
    "everything you know about me",
    "my profile",
    "personal profile",
    "user profile",
    "personal facts",
    "personal memory",
    "who am i",
  ].some((phrase) => normalizedHaystack.includes(phrase)) ||
    /\bsummari[sz]e\b[\s\S]{0,80}\bme\b/.test(normalizedHaystack) ||
    /\bwhat\b[\s\S]{0,60}\byou\b[\s\S]{0,60}\bknow\b[\s\S]{0,60}\bme\b/.test(normalizedHaystack)
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

function getRecentRoutingText(page: RelayPageState) {
  return page.recentRoutingText ?? page.recentUserTurnText ?? null
}

function getFullVisibleRoutingText(page: RelayPageState) {
  return page.fullVisibleRoutingText ?? getRecentRoutingText(page)
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

function buildAssociationComparisonKey(page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url" | "sourceConversationId">) {
  const platform = page.platform ?? "unknown"
  if (page.sourceConversationId) {
    return `${platform}:conversation:${page.sourceConversationId}`
  }
  if (page.pageFingerprint) {
    return `${platform}:fingerprint:${page.pageFingerprint}`
  }

  if (page.pathname && page.pathname !== "/") {
    return `${platform}:path:${page.pathname}`
  }

  return `${platform}:url:${page.url ?? ""}`
}

export function buildAssociationKey(page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url" | "sourceConversationId">) {
  return buildAssociationComparisonKey(page)
}

/**
 * Pick the project id that should drive the active/picker project and the next
 * save, honoring precedence: a manual project override wins over the chat's
 * auto-derived association, which wins over a remembered approved association.
 *
 * Membership matters: a candidate id is only honored when it exists in the
 * current project options (the personal project IS in this list). An override
 * whose project is no longer available falls through to the association rather
 * than silently nulling the selection. Returns null when nothing qualifies.
 */
export function pickPreferredProjectId(input: {
  manualProjectId?: string | null
  associationProjectId?: string | null
  rememberedProjectId?: string | null
  projectIds: ReadonlyArray<string>
}): string | null {
  const available = new Set(input.projectIds)
  const candidates = [
    input.manualProjectId,
    input.associationProjectId,
    input.rememberedProjectId,
  ]
  for (const candidate of candidates) {
    if (candidate && available.has(candidate)) {
      return candidate
    }
  }
  return null
}

export function findApprovedAssociationMatch(
  page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url" | "sourceConversationId">,
  approvedAssociations: RelayApprovedAssociation[]
) {
  const exactKey = buildAssociationComparisonKey(page)

  return (
    approvedAssociations.find((association) => association.key === exactKey) ??
    approvedAssociations.find(
      (association) =>
        samePlatform(page, association) &&
        Boolean(page.sourceConversationId) &&
        association.sourceConversationId === page.sourceConversationId
    ) ??
    approvedAssociations.find(
      (association) =>
        samePlatform(page, association) &&
        Boolean(page.pageFingerprint) &&
        association.pageFingerprint === page.pageFingerprint
    ) ??
    approvedAssociations.find((association) => Boolean(page.url) && association.url === page.url) ??
    approvedAssociations.find(
      (association) =>
        Boolean(page.pathname) &&
        Boolean(page.platform) &&
        page.pathname !== "/" &&
        association.pathname !== "/" &&
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
    candidate.signalCategories.add("association")
    pushReason(candidate, "Matched a previously approved chat fingerprint.")
    return
  }

  if (samePlatform(page, association) && page.pageFingerprint && association.pageFingerprint === page.pageFingerprint) {
    candidate.score += 100
    candidate.highConfidenceEligible = true
    candidate.signalCategories.add("association")
    pushReason(candidate, "Matched an approved chat fingerprint on this platform.")
    return
  }

  if (samePlatform(page, association) && page.sourceConversationId && association.sourceConversationId === page.sourceConversationId) {
    candidate.score += 104
    candidate.highConfidenceEligible = true
    candidate.signalCategories.add("association")
    pushReason(candidate, "Matched a previously approved conversation identity.")
    return
  }

  if (page.url && association.url === page.url) {
    candidate.score += 84
    candidate.highConfidenceEligible = true
    candidate.signalCategories.add("association")
    pushReason(candidate, "Matched an approved chat URL.")
    return
  }

  if (page.pathname && association.pathname === page.pathname && association.platform === page.platform) {
    candidate.score += 58
    candidate.signalCategories.add("association")
    pushReason(candidate, "Matched a recent approved path on this platform.")
    return
  }

  if (
    candidate.phase === "context-aware" &&
    !candidate.domainMatchApplied &&
    page.domain &&
    association.domain === page.domain &&
    association.platform === page.platform
  ) {
    candidate.score += 8
    candidate.domainMatchApplied = true
    candidate.signalCategories.add("association")
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
    wholeChatExactMention: false,
    domainMatchApplied: false,
    signalCategories: new Set(),
  }
  const projectTokens = collectProjectTokens(project)
  const descriptionTokens = collectProjectDescriptionTokens(project)
  const contextTokens = collectProjectContextTokens(project)
  const titleTokens = uniqueTokens([input.page.title])
  const pathTokens = uniqueTokens([input.page.pathname, input.page.url])
  const latestUserTokens = uniqueTokens([input.page.recentUserTurnText ?? null])
  const routingText = getRecentRoutingText(input.page)
  const recentWindowTokens = uniqueTokens([routingText])
  const fullVisibleRoutingText = getFullVisibleRoutingText(input.page)
  const fullVisibleTokens = uniqueTokens([fullVisibleRoutingText])
  const personalProfileIntent =
    hasPersonalProfileIntent(input.page.title) ||
    hasPersonalProfileIntent(routingText) ||
    hasPersonalProfileIntent(fullVisibleRoutingText)

  for (const association of input.approvedAssociations) {
    scoreApprovedAssociation(candidate, input, association)
  }

  const verbatimNameMention =
    hasProjectNameMention(project, input.page.title) ||
    hasProjectNameMention(project, routingText)
  if (verbatimNameMention) {
    candidate.score += candidate.phase === "bootstrap" ? 42 : 34
    candidate.explicitNameSignal = true
    candidate.signalCategories.add("name")
    pushReason(candidate, "The project name appears verbatim in the current chat.")
  }

  const titleOverlap = overlapCount(projectTokens, titleTokens)
  if (titleOverlap > 0) {
    candidate.score += Math.min(candidate.phase === "bootstrap" ? 42 : 24, titleOverlap * (candidate.phase === "bootstrap" ? 14 : 8))
    candidate.explicitNameSignal = true
    candidate.signalCategories.add("title")
    pushReason(candidate, "Project name overlaps with the chat title.")
  }

  const latestUserOverlap = overlapCount(projectTokens, latestUserTokens)
  if (latestUserOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 32 : 20,
      latestUserOverlap * (candidate.phase === "bootstrap" ? 12 : 7)
    )
    candidate.explicitNameSignal = true
    candidate.signalCategories.add("name")
    pushReason(candidate, "The latest user turn mentions the project.")
  }

  const recentWindowOverlap = overlapCount(projectTokens, recentWindowTokens)
  if (recentWindowOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 20 : 14,
      recentWindowOverlap * (candidate.phase === "bootstrap" ? 6 : 4)
    )
    candidate.explicitNameSignal = true
    candidate.signalCategories.add("name")
    pushReason(candidate, "Recent chat turns mention the project.")
  }

  const exactWholeChatMention =
    !verbatimNameMention &&
    hasProjectNameMention(project, fullVisibleRoutingText)
  if (exactWholeChatMention) {
    candidate.score += candidate.phase === "bootstrap" ? 26 : 18
    candidate.explicitNameSignal = true
    candidate.wholeChatExactMention = true
    candidate.signalCategories.add("name")
    pushReason(candidate, "A visible chat turn mentions the project by name.")
  }

  const pathOverlap = overlapCount(projectTokens, pathTokens)
  if (pathOverlap > 0) {
    candidate.score += Math.min(candidate.phase === "bootstrap" ? 18 : 12, pathOverlap * 6)
    candidate.signalCategories.add("name")
    pushReason(candidate, "Project name overlaps with the route or URL.")
  }

  const incidentalReferenceMention =
    hasIncidentalReferenceMention(project, input.page.recentUserTurnText) ||
    hasIncidentalReferenceMention(project, routingText)
  if (incidentalReferenceMention) {
    candidate.score = Math.max(0, candidate.score - (candidate.phase === "bootstrap" ? 30 : 22))
    candidate.highConfidenceEligible = false
    pushReason(candidate, "The project appears to be mentioned only as a reference.")
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
    candidate.signalCategories.add("description")
    pushReason(candidate, "The project description overlaps with the chat title.")
  }

  const descriptionRecentWindowOverlap = overlapCount(descriptionTokens, recentWindowTokens)
  if (descriptionRecentWindowOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 34 : 16,
      descriptionRecentWindowOverlap * (candidate.phase === "bootstrap" ? 10 : 5)
    )
    if (
      candidate.phase === "bootstrap"
        ? descriptionRecentWindowOverlap >= 3
        : descriptionRecentWindowOverlap >= 2
    ) {
      candidate.highConfidenceEligible = true
    }
    candidate.bootstrapDescriptionOverlap += descriptionRecentWindowOverlap
    candidate.signalCategories.add("description")
    pushReason(candidate, "Recent chat turns overlap with the project description.")
  }

  const descriptionPathOverlap = overlapCount(descriptionTokens, pathTokens)
  if (descriptionPathOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 10 : 6,
      descriptionPathOverlap * 3
    )
    candidate.bootstrapDescriptionOverlap += descriptionPathOverlap
    candidate.signalCategories.add("description")
    pushReason(candidate, "The route overlaps with the project description.")
  }

  const descriptionWholeChatOverlap =
    descriptionRecentWindowOverlap === 0
      ? overlapCount(descriptionTokens, fullVisibleTokens)
      : 0
  if (descriptionWholeChatOverlap > 0) {
    candidate.score += Math.min(
      candidate.phase === "bootstrap" ? 14 : 8,
      descriptionWholeChatOverlap * (candidate.phase === "bootstrap" ? 4 : 2)
    )
    if (
      candidate.phase === "bootstrap"
        ? descriptionWholeChatOverlap >= 4
        : descriptionWholeChatOverlap >= 3
    ) {
      candidate.highConfidenceEligible = true
    }
    candidate.bootstrapDescriptionOverlap += descriptionWholeChatOverlap
    candidate.signalCategories.add("description")
    pushReason(candidate, "Visible chat turns overlap with the project description.")
  }

  const contextTitleOverlap = overlapCount(contextTokens, titleTokens)
  const contextUserOverlap = overlapCount(contextTokens, recentWindowTokens)
  const contextPathOverlap = overlapCount(contextTokens, pathTokens)
  const reinforcedByContext =
    candidate.phase === "context-aware" &&
    contextTitleOverlap + contextUserOverlap + contextPathOverlap > 0

  if (candidate.phase === "context-aware" && contextTitleOverlap > 0) {
    candidate.score += Math.min(20, contextTitleOverlap * 5)
    if (contextTitleOverlap >= 2) {
      candidate.highConfidenceEligible = true
    }
    candidate.signalCategories.add("context")
    pushReason(candidate, "The chat title overlaps with saved project context.")
  }

  if (candidate.phase === "context-aware" && contextUserOverlap > 0) {
    candidate.score += Math.min(30, contextUserOverlap * 6)
    if (contextUserOverlap >= 2) {
      candidate.highConfidenceEligible = true
    }
    candidate.signalCategories.add("context")
    pushReason(candidate, "Recent chat turns overlap with saved project context.")
  }

  if (candidate.phase === "context-aware" && contextPathOverlap > 0) {
    candidate.score += Math.min(10, contextPathOverlap * 4)
    candidate.signalCategories.add("context")
    pushReason(candidate, "The route overlaps with saved project context.")
  }

  const allowWeakAffinity = candidate.highConfidenceEligible || reinforcedByContext
  if (input.boundProject?.projectId === project.id && allowWeakAffinity) {
    if (input.boundProject.bindingKind === "tab") {
      candidate.score += 10
      candidate.signalCategories.add("binding")
      pushReason(candidate, "This tab is already linked to the project.")
    } else if (input.boundProject.bindingKind === "domain") {
      candidate.score += candidate.phase === "context-aware" ? 6 : 3
      candidate.signalCategories.add("binding")
      pushReason(candidate, "This domain was previously linked to the project.")
    } else {
      candidate.score += 4
      candidate.signalCategories.add("binding")
      pushReason(candidate, "This project was manually chosen recently.")
    }
  }

  if (input.lastTabProjectId === project.id && allowWeakAffinity) {
    candidate.score += 3
    candidate.signalCategories.add("binding")
    pushReason(candidate, "This tab was recently associated with the project.")
  }

  if (input.selectedProjectId === project.id && allowWeakAffinity) {
    candidate.score += 2
    candidate.signalCategories.add("binding")
    pushReason(candidate, "This is the currently selected project.")
  }

  if (
    personalProfileIntent &&
    project.kind !== "personal" &&
    !candidate.signalCategories.has("association")
  ) {
    candidate.score = Math.min(candidate.score, 20)
    candidate.highConfidenceEligible = false
    pushReason(candidate, "The chat is primarily asking about the user, not this project.")
  }

  // Cap description-only scoring: if the ONLY signals are from description overlap
  // (no name, title, context, or binding), cap score at 40 to prevent pure
  // description matching from reaching auto-save thresholds
  const nonDescriptionCategories = new Set(candidate.signalCategories)
  nonDescriptionCategories.delete("description")
  nonDescriptionCategories.delete("association")
  if (candidate.signalCategories.has("description") && nonDescriptionCategories.size === 0) {
    candidate.score = Math.min(candidate.score, 40)
    candidate.highConfidenceEligible = false
  }

  return candidate
}

function resolveConfidence(
  top: CandidateScore,
  runnerUpScore: number,
  _input: EvaluateProjectRoutingInput,
) {
  const scoreGap = top.score - runnerUpScore

  // Association matches are inherently high-confidence — skip diversity check
  const hasAssociationMatch = top.signalCategories.has("association")

  // For auto-save, require at least 2 distinct content signal categories
  // (name, title, description, context) unless backed by an association match
  const contentCategories = getContentSignalCategories(top.signalCategories)
  const hasSignalDiversity = hasAssociationMatch || contentCategories.size >= 2
  const hasStrongContentSignal = hasAssociationMatch || hasNonNameContentSignal(top.signalCategories)
  const nameOnlyReference =
    !hasAssociationMatch &&
    top.explicitNameSignal &&
    !hasStrongContentSignal

  if (
    top.highConfidenceEligible &&
    (hasAssociationMatch || top.phase === "context-aware") &&
    top.score >= (top.phase === "bootstrap" ? 70 : 68) &&
    scoreGap >= (top.phase === "bootstrap" ? 18 : 12) &&
    hasSignalDiversity &&
    hasStrongContentSignal
  ) {
    return "high" as const
  }

  if (nameOnlyReference) {
    if (
      top.score >= (top.phase === "bootstrap" ? 54 : 46) &&
      scoreGap >= (top.phase === "bootstrap" ? 8 : 6)
    ) {
      return "medium" as const
    }

    return "low" as const
  }

  if (
    (top.explicitNameSignal || top.wholeChatExactMention) &&
    top.score >= (top.phase === "bootstrap" ? 24 : 22) &&
    scoreGap >= (top.phase === "bootstrap" ? 6 : 5)
  ) {
    return "medium" as const
  }

  if (top.score >= (top.phase === "bootstrap" ? 38 : 35)) {
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
      reasons: ["No supported project routing signal was available."],
      diagnostics: {
        phase: "none",
        scoreGap: 0,
        explicitNameSignal: false,
        wholeChatExactMention: false,
        highConfidenceEligible: false,
        signalCategories: [],
      },
      topCandidates: [],
    }
  }

  // NOTE: we deliberately do NOT route the whole session into the personal
  // project on self-disclosure. The server's item-level fan-out
  // (routePersonalMemory) already runs on every non-personal capture and
  // extracts ONLY the durable user facts into Personal as categorized notes —
  // so a mixed chat keeps its session in the right project while its personal
  // bits still land in Personal. Whole-session routing here would dump unrelated
  // project context into Personal. (Personal is still the target when the user
  // deliberately selects it — handled in the capture path, not the scorer.)

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
      reasons: ["No project candidates were available."],
      diagnostics: {
        phase: "none",
        scoreGap: 0,
        explicitNameSignal: false,
        wholeChatExactMention: false,
        highConfidenceEligible: false,
        signalCategories: [],
      },
      topCandidates: [],
    }
  }

  const confidence = resolveConfidence(top, runnerUp?.score ?? 0, input)
  const scoreGap = top.score - (runnerUp?.score ?? 0)

  return {
    mode: confidence === "high" ? "auto-save" : confidence === "medium" ? "hold" : "ignore",
    confidence,
    candidateProjectId: confidence === "low" ? null : top.projectId,
    candidateProjectName: confidence === "low" ? null : top.projectName,
    score: top.score,
    reasons: top.reasons.slice(0, 4),
    diagnostics: {
      phase: top.phase,
      scoreGap,
      explicitNameSignal: top.explicitNameSignal,
      wholeChatExactMention: top.wholeChatExactMention,
      highConfidenceEligible: top.highConfidenceEligible,
      signalCategories: Array.from(top.signalCategories),
    },
    topCandidates: candidates.slice(0, 3).map((candidate) => ({
      projectId: candidate.projectId,
      projectName: candidate.projectName,
      score: candidate.score,
      reasons: candidate.reasons.slice(0, 4),
    })),
  }
}
