export interface SourceRetrievalGoldCase {
  id: string
  query: string
  expectedOfficialDomains: string[]
  requiredConcepts: string[]
  forbiddenTerms?: string[]
  expectedPackageIds?: string[]
}

export interface SourceRetrievalBenchmarkHit {
  url: string
  title?: string | null
  content?: string | null
  officialClaim?: boolean
  stale?: boolean
}

export interface SourceRetrievalBenchmarkRun {
  caseId: string
  hits: SourceRetrievalBenchmarkHit[]
  latencyMs?: number
  tokenBudget?: number
  tokenEstimate?: number
}

export interface SourceRetrievalBenchmarkReport {
  cases: number
  sourceResolutionTop1: number
  sourceResolutionTop3: number
  sourceResolutionMrr: number
  falseOfficialClaims: number
  citationRecallAt5: number
  citationRecallAt10: number
  requiredConceptCoverage: number
  forbiddenTermFailureRate: number
  duplicateRate: number
  staleCitationRate: number
  averageLatencyMs: number | null
  averageTokenBudgetUse: number | null
}

function normalizeDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return value.toLowerCase().replace(/^www\./, "")
  }
}

function isExpectedOfficial(url: string, domains: string[]) {
  const domain = normalizeDomain(url)
  return domains.some((expected) => {
    const normalized = normalizeDomain(expected)
    return domain === normalized || domain.endsWith(`.${normalized}`)
  })
}

function includesConcept(text: string, concept: string) {
  return text.toLowerCase().includes(concept.toLowerCase())
}

export function parseSourceRetrievalGoldJsonl(text: string): SourceRetrievalGoldCase[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SourceRetrievalGoldCase)
}

export function evaluateSourceRetrievalBenchmark(
  cases: SourceRetrievalGoldCase[],
  runs: SourceRetrievalBenchmarkRun[],
): SourceRetrievalBenchmarkReport {
  const runsByCase = new Map(runs.map((run) => [run.caseId, run]))
  let top1 = 0
  let top3 = 0
  let reciprocalRank = 0
  let recall5 = 0
  let recall10 = 0
  let conceptCoverage = 0
  let forbiddenFailures = 0
  let falseOfficialClaims = 0
  let duplicateUrls = 0
  let totalUrls = 0
  let staleCitations = 0
  let totalCitations = 0
  let latencySum = 0
  let latencyCount = 0
  let tokenUseSum = 0
  let tokenUseCount = 0

  for (const item of cases) {
    const hits = runsByCase.get(item.id)?.hits ?? []
    const officialRank = hits.findIndex((hit) => isExpectedOfficial(hit.url, item.expectedOfficialDomains))
    if (officialRank === 0) top1 += 1
    if (officialRank >= 0 && officialRank < 3) top3 += 1
    if (officialRank >= 0) reciprocalRank += 1 / (officialRank + 1)
    if (hits.slice(0, 5).some((hit) => isExpectedOfficial(hit.url, item.expectedOfficialDomains))) recall5 += 1
    if (hits.slice(0, 10).some((hit) => isExpectedOfficial(hit.url, item.expectedOfficialDomains))) recall10 += 1

    const topContent = hits.slice(0, 5).map((hit) => `${hit.title ?? ""}\n${hit.content ?? ""}`).join("\n")
    const requiredMatches = item.requiredConcepts.filter((concept) => includesConcept(topContent, concept)).length
    conceptCoverage += item.requiredConcepts.length === 0 ? 1 : requiredMatches / item.requiredConcepts.length
    if ((item.forbiddenTerms ?? []).some((term) => includesConcept(topContent, term))) forbiddenFailures += 1

    const seen = new Set<string>()
    for (const hit of hits.slice(0, 10)) {
      const key = hit.url
      if (seen.has(key)) duplicateUrls += 1
      seen.add(key)
      totalUrls += 1
      if (hit.officialClaim && !isExpectedOfficial(hit.url, item.expectedOfficialDomains)) falseOfficialClaims += 1
      if (hit.stale) staleCitations += 1
      totalCitations += 1
    }

    const run = runsByCase.get(item.id)
    if (typeof run?.latencyMs === "number") {
      latencySum += run.latencyMs
      latencyCount += 1
    }
    if (run?.tokenBudget && typeof run.tokenEstimate === "number") {
      tokenUseSum += Math.min(run.tokenEstimate / run.tokenBudget, 1)
      tokenUseCount += 1
    }
  }

  const denominator = Math.max(cases.length, 1)
  return {
    cases: cases.length,
    sourceResolutionTop1: top1 / denominator,
    sourceResolutionTop3: top3 / denominator,
    sourceResolutionMrr: reciprocalRank / denominator,
    falseOfficialClaims,
    citationRecallAt5: recall5 / denominator,
    citationRecallAt10: recall10 / denominator,
    requiredConceptCoverage: conceptCoverage / denominator,
    forbiddenTermFailureRate: forbiddenFailures / denominator,
    duplicateRate: totalUrls === 0 ? 0 : duplicateUrls / totalUrls,
    staleCitationRate: totalCitations === 0 ? 0 : staleCitations / totalCitations,
    averageLatencyMs: latencyCount === 0 ? null : latencySum / latencyCount,
    averageTokenBudgetUse: tokenUseCount === 0 ? null : tokenUseSum / tokenUseCount,
  }
}

export function getOptionalBaselineStatus(env: Record<string, string | undefined> = process.env) {
  return {
    context7: env.CONTEXT7_BENCHMARK === "1" ? "available" : "skipped",
    nia: env.NIA_BENCHMARK === "1" ? "available" : "skipped",
  } as const
}
