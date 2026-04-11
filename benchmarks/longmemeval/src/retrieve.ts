import { MemoryRepository } from "@relay/db"
import type { DatabaseProvider } from "@relay/db"
import type { Embedder } from "./embed"

export interface RetrievedChunk {
  id: string
  content: string
  session_id?: string
  session_date?: string
  role?: string
  capturedAt?: string | null
  sourceSurface?: string | null
  score: number
  matchType: "semantic" | "lexical"
}

/**
 * Hybrid search (semantic + lexical) against Relay's memory_items table.
 * Returns the top-K chunks ordered by combined score.
 */
export async function retrieve(opts: {
  provider: DatabaseProvider
  projectId: string
  query: string
  embedder: Embedder
  topK?: number
}): Promise<RetrievedChunk[]> {
  const repo = new MemoryRepository(opts.provider)
  const queryEmbedding = await opts.embedder.embed(opts.query)
  const results = await repo.hybridSearch(
    opts.projectId,
    opts.query,
    queryEmbedding,
    { limit: opts.topK ?? 20, threshold: 0.3 },
  )
  return results.map((row) => {
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
}
