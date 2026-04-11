import { MemoryRepository } from "@relay/db"
import type { DatabaseProvider } from "@relay/db"
import type { CreateMemoryItemInput } from "@relay/shared"
import type { Embedder } from "./embed"
import type { LongMemEvalInstance } from "./types"

// Batch size for insert + embedding calls. Small enough to keep memory flat,
// large enough to amortize embedding API round trips.
const BATCH_SIZE = 64

/**
 * Ingest all haystack sessions for a single LongMemEval instance into a project.
 * Each turn becomes one `memory_items` row with session/role/timestamp metadata.
 */
export async function ingestInstance(opts: {
  provider: DatabaseProvider
  userId: string
  projectId: string
  instance: LongMemEvalInstance
  embedder: Embedder
}): Promise<{ items: number }> {
  const repo = new MemoryRepository(opts.provider)
  const { instance } = opts

  // Flatten haystack into insert payloads with stable metadata.
  const payloads: CreateMemoryItemInput[] = []
  for (let i = 0; i < instance.haystack_sessions.length; i++) {
    const session = instance.haystack_sessions[i]
    const sessionId = instance.haystack_session_ids[i]
    const sessionDate = instance.haystack_dates[i]
    for (let turnIdx = 0; turnIdx < session.length; turnIdx++) {
      const turn = session[turnIdx]
      if (!turn.content || turn.content.trim() === "") continue
      payloads.push({
        projectId: opts.projectId,
        type: "note",
        title: null,
        content: turn.content,
        metadata: {
          session_id: sessionId,
          session_date: sessionDate,
          turn_index: turnIdx,
          role: turn.role,
          has_answer: turn.has_answer ?? false,
        },
        sourceConversationId: sessionId,
        capturedAt: sessionDate,
      })
    }
  }

  let inserted = 0
  for (let start = 0; start < payloads.length; start += BATCH_SIZE) {
    const batch = payloads.slice(start, start + BATCH_SIZE)
    const rows = await repo.createBatch(opts.userId, batch)
    const embeddings = await opts.embedder.embedBatch(batch.map((p) => p.content))
    // Note: MemoryRepository.updateEmbeddingsBatch has a uuid/text cast bug we
    // avoid by updating one row at a time.
    for (let i = 0; i < rows.length; i++) {
      await repo.updateEmbedding(rows[i].id, embeddings[i], "text-embedding-3-small")
    }
    inserted += rows.length
  }

  return { items: inserted }
}
