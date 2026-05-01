import type { CanonEntryKind, QueryReasoningMode, QueryStateIntent } from "@relay/shared"
import { analyzeQueryCore } from "@relay/shared"

export interface QueryDecomposition {
  normalizedQuery: string
  stateIntent: QueryStateIntent
  reasoningMode: QueryReasoningMode
  projectStateIntent: boolean
  canonKinds: CanonEntryKind[]
  historicalAt: string | null
  sourceDateRange: { from?: string | null; to?: string | null } | undefined
  asksCountOrTotal: boolean
  asksOrder: boolean
  asksDuration: boolean
  extractedEntities: string[]
  isMultiHop: boolean
}

const projectStateKeywords = [
  "status",
  "state",
  "objective",
  "decision",
  "constraint",
  "task",
  "progress",
  "risk",
  "assumption",
  "question",
  "what changed",
  "current plan",
  "current objective",
  "next step",
] as const

const canonKindKeywords: Array<{ kind: CanonEntryKind; keywords: string[] }> = [
  { kind: "objective", keywords: ["objective", "goal", "focus"] },
  { kind: "decision", keywords: ["decision", "decided", "chose"] },
  { kind: "constraint", keywords: ["constraint", "limit", "must not", "cannot"] },
  { kind: "task", keywords: ["task", "todo", "next step", "open work"] },
  { kind: "progress", keywords: ["progress", "done", "shipped", "finished", "changed"] },
  { kind: "artifact", keywords: ["artifact", "file", "doc", "spec"] },
  { kind: "architecture_fact", keywords: ["architecture", "stack", "schema", "infra"] },
  { kind: "risk", keywords: ["risk", "danger", "blocker"] },
  { kind: "assumption", keywords: ["assumption", "assume", "hypothesis"] },
  { kind: "question", keywords: ["question", "unknown", "unclear"] },
] as const

export function decomposeQuery(query: string, options?: { referenceDate?: string | null }): QueryDecomposition {
  const core = analyzeQueryCore(query, options)
  const lower = core.normalizedQuery.toLowerCase()

  return {
    ...core,
    projectStateIntent: projectStateKeywords.some((keyword) => lower.includes(keyword)),
    canonKinds: canonKindKeywords
      .filter(({ keywords }) => keywords.some((keyword) => lower.includes(keyword)))
      .map(({ kind }) => kind),
    sourceDateRange: core.dateRange,
  }
}
