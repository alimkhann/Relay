import { CanonEntryRepository, MemoryRepository, ProjectStateRepository, ProjectSummarySnapshotRepository } from "@relay/db"
import type { DatabaseProvider } from "@relay/db"
import type { Embedder } from "./embed"
import { analyzeBenchmarkQuery } from "./query"
import { chooseRetrievalBudget, diversifyChunksForCoverage } from "./reasoning"

function sortCanonByTime<T extends { validFrom: string | null; updatedAt: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.validFrom ?? left.updatedAt)
    const rightTime = Date.parse(right.validFrom ?? right.updatedAt)
    return rightTime - leftTime
  })
}

export interface RetrievedChunk {
  id: string
  content: string
  session_id?: string
  session_date?: string
  role?: string
  capturedAt?: string | null
  sourceSurface?: string | null
  score: number
  matchType: "semantic" | "lexical" | "summary" | "canon" | "state"
}

/**
 * Hybrid search (semantic + lexical) against Relay's memory_items table.
 * Returns the top-K chunks ordered by combined score.
 */
export async function retrieve(opts: {
  provider: DatabaseProvider
  projectId: string
  query: string
  questionDate?: string | null
  embedder: Embedder
  topK?: number
}): Promise<RetrievedChunk[]> {
  const repo = new MemoryRepository(opts.provider)
  const canonRepo = new CanonEntryRepository(opts.provider)
  const stateRepo = new ProjectStateRepository(opts.provider)
  const summaryRepo = new ProjectSummarySnapshotRepository(opts.provider)
  const analysis = analyzeBenchmarkQuery(opts.query, { referenceDate: opts.questionDate ?? null })
  const retrievalBudget = chooseRetrievalBudget(analysis.reasoningMode)
  const queryEmbedding = await opts.embedder.embed(opts.query)
  const results = await repo.hybridSearch(
    opts.projectId,
    analysis.normalizedQuery,
    queryEmbedding,
    {
      limit: retrievalBudget.memoryLimit,
      threshold: 0.3,
      dateRange: analysis.dateRange,
      includeSuperseded: analysis.stateIntent === "historical",
      // Bench haystacks are anchored on real-world dates (often years old
      // relative to "now"). Default recency decay (30d half-life) collapses
      // every turn's score to near-zero and distorts ranking for knowledge-
      // update and preference questions that target older sessions. Disable
      // by pushing half-life way out.
      recencyHalfLifeDays: 36500,
    },
  )
  const summaries = await summaryRepo.searchByProject(opts.projectId, analysis.normalizedQuery, {
    kind: "session_summary",
    historicalAt: analysis.historicalAt,
    limit: 6,
  })
  const canonEntries = await canonRepo.searchByProject(opts.projectId, analysis.normalizedQuery, {
    currentOnly: analysis.stateIntent === "current",
    historicalAt: analysis.historicalAt,
    limit: 8,
  })
  const state = await stateRepo.getByProject(opts.projectId)

  const memoryChunks = results.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      content: row.content,
      session_id: meta.session_id as string | undefined,
      session_date: meta.session_date as string | undefined,
      role: meta.role as string | undefined,
      capturedAt: row.capturedAt,
      sourceSurface: row.sourceSurface,
      score: row.similarity,
      matchType: row.matchType,
    }
  })

  const summaryChunks: RetrievedChunk[] = summaries.map((row, index) => ({
    id: row.id,
    content: row.content,
    session_id: row.derivedFrom[0],
    session_date: typeof row.generationMetadata.session_date === "string" ? row.generationMetadata.session_date : undefined,
    score: Math.max(0.15, 0.95 - index * 0.08),
    matchType: "summary",
  }))

  const rankedCanon = sortCanonByTime(canonEntries)
  const canonChunks: RetrievedChunk[] = rankedCanon.map((row, index) => ({
    id: row.id,
    content:
      analysis.reasoningMode === "current_state" || analysis.reasoningMode === "aggregation"
        ? `[${row.kind} ${index === 0 ? "current" : index === 1 ? "previous" : "historical"}] ${row.content}`
        : analysis.reasoningMode === "historical_state"
          ? `[${row.kind} historical] ${row.content}`
          : `[${row.kind}] ${row.content}`,
    session_date: row.validFrom ?? undefined,
    score: Math.max(0.2, 0.98 - index * 0.06),
    matchType: "canon",
  }))

  const stateChunks: RetrievedChunk[] = state
    ? [
        {
          id: `state:${opts.projectId}`,
          content: [
            state.projectOverview ? `Overview: ${state.projectOverview}` : null,
            state.currentObjective ? `Current objective: ${state.currentObjective}` : null,
            state.recentProgress ? `Recent progress: ${state.recentProgress}` : null,
            state.decisions[0] ? `Decision: ${state.decisions[0]}` : null,
            state.constraints[0] ? `Constraint: ${state.constraints[0]}` : null,
            state.openTasks[0] ? `Task: ${state.openTasks[0]}` : null,
          ].filter((value): value is string => Boolean(value)).join("\n"),
          score: 0.35,
          matchType: "state" as const,
        },
      ].filter((chunk) => chunk.content.length > 0)
    : []

  const merged = [...canonChunks, ...summaryChunks, ...stateChunks, ...memoryChunks]
    .sort((left, right) => right.score - left.score)

  return diversifyChunksForCoverage(merged, opts.topK ?? retrievalBudget.finalTopK)
}
