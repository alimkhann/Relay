import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import {
  EMBEDDING_MODEL,
  backfillMissingEmbeddings,
  backfillStaleEmbeddings,
  generateEmbedding,
} from "@/server/services/embedding-service"

/**
 * One-off / scheduled embedding backfill for the three tables that carry
 * pgvector columns: memory_items, canonical_entities, source_chunks.
 *
 * Production caught a months-long silent failure: `text-embedding-004` was
 * deprecated by Google on 2026-01-14 and `embedContent` started returning 404.
 * The legacy embed callsites use fire-and-forget (`void embedMemoryItem(...)`),
 * so the error never surfaced — every new row landed without an embedding and
 * recall fell back to lexical-only. After patching the embed-service to
 * `gemini-embedding-001:rd-768`, this route lets us re-embed the back catalog.
 *
 * Auth: same Bearer-token discipline as the memory-pipeline cron — fails closed
 * in production when `CRON_SECRET` is unset.
 *
 * Query params:
 *   ?table = memory_items | canonical_entities | source_chunks (default: all)
 *   ?limit = max rows per table per call (default 50, max 500)
 *
 * Returns per-table { embedded, remaining } counts.
 */

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false
    console.warn(
      "[embedding-backfill cron] CRON_SECRET unset — allowing unauthenticated run (non-production only).",
    )
    return true
  }
  const auth = request.headers.get("authorization") ?? ""
  return auth === `Bearer ${secret}`
}

type TableKey = "memory_items" | "canonical_entities" | "source_chunks"

async function backfillCanonicalEntities(
  provider: ReturnType<typeof createRepositoryBundle>["provider"],
  limit: number,
): Promise<{ embedded: number; remaining: number }> {
  const rows = (await provider.query(
    `SELECT id, name, kind FROM canonical_entities
     WHERE embedding IS NULL
     ORDER BY created_at ASC
     LIMIT $1::int`,
    [limit],
  )) as Array<{ id: string; name: string; kind: string | null }>

  let embedded = 0
  for (const row of rows) {
    const text = row.kind ? `${row.name} (${row.kind})` : row.name
    try {
      const vector = await generateEmbedding(text, "RETRIEVAL_DOCUMENT")
      await provider.query(
        `UPDATE canonical_entities SET embedding = $2::vector WHERE id = $1::uuid`,
        [row.id, JSON.stringify(vector)],
      )
      embedded += 1
    } catch (err) {
      console.error("[embedding-backfill] canonical_entities row failed", row.id, err)
    }
  }

  const remainingRows = (await provider.query(
    `SELECT COUNT(*)::int AS remaining FROM canonical_entities WHERE embedding IS NULL`,
  )) as Array<{ remaining: number }>

  return { embedded, remaining: remainingRows[0]?.remaining ?? 0 }
}

async function backfillSourceChunks(
  provider: ReturnType<typeof createRepositoryBundle>["provider"],
  limit: number,
): Promise<{ embedded: number; remaining: number }> {
  const rows = (await provider.query(
    `SELECT id, content FROM source_chunks
     WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1::text
     ORDER BY created_at ASC
     LIMIT $2::int`,
    [EMBEDDING_MODEL, limit],
  )) as Array<{ id: string; content: string }>

  let embedded = 0
  for (const row of rows) {
    try {
      const vector = await generateEmbedding(row.content, "RETRIEVAL_DOCUMENT")
      await provider.query(
        `UPDATE source_chunks
           SET embedding = $2::vector, embedding_model = $3::text
         WHERE id = $1::uuid`,
        [row.id, JSON.stringify(vector), EMBEDDING_MODEL],
      )
      embedded += 1
    } catch (err) {
      console.error("[embedding-backfill] source_chunks row failed", row.id, err)
    }
  }

  const remainingRows = (await provider.query(
    `SELECT COUNT(*)::int AS remaining FROM source_chunks
      WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1::text`,
    [EMBEDDING_MODEL],
  )) as Array<{ remaining: number }>

  return { embedded, remaining: remainingRows[0]?.remaining ?? 0 }
}

async function backfillMemoryItems(
  repositories: ReturnType<typeof createRepositoryBundle>,
  limit: number,
): Promise<{ embedded: number; remaining: number }> {
  const missing = await backfillMissingEmbeddings(repositories, limit)
  const remainingLimit = Math.max(0, limit - missing)
  const stale = remainingLimit > 0 ? await backfillStaleEmbeddings(repositories, remainingLimit) : 0

  const remainingRows = (await repositories.provider.query(
    `SELECT COUNT(*)::int AS remaining FROM memory_items
      WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1::text`,
    [EMBEDDING_MODEL],
  )) as Array<{ remaining: number }>

  return {
    embedded: missing + stale,
    remaining: remainingRows[0]?.remaining ?? 0,
  }
}

async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const tableParam = url.searchParams.get("table") as TableKey | "all" | null
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    500,
  )

  const repositories = createRepositoryBundle()

  const tables: TableKey[] =
    tableParam && tableParam !== "all"
      ? [tableParam]
      : ["memory_items", "canonical_entities", "source_chunks"]

  const startedAt = Date.now()
  const results: Record<string, { embedded: number; remaining: number }> = {}

  for (const table of tables) {
    if (table === "memory_items") {
      results[table] = await backfillMemoryItems(repositories, limit)
    } else if (table === "canonical_entities") {
      results[table] = await backfillCanonicalEntities(repositories.provider, limit)
    } else if (table === "source_chunks") {
      results[table] = await backfillSourceChunks(repositories.provider, limit)
    }
  }

  return NextResponse.json({
    embeddingModel: EMBEDDING_MODEL,
    limit,
    durationMs: Date.now() - startedAt,
    tables: results,
  })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
