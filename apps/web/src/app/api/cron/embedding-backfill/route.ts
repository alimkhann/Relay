import { NextResponse } from "next/server"

// Operator runs this in a tight loop (50 rows × N calls) during cutover.
// Each call can take ~70s for the full 3-table sweep.
export const maxDuration = 300

import { createRepositoryBundle, createWorkerRepositoryBundle } from "@relay/db"

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
 *   ?table = memory_items | observations | canonical_entities | source_chunks (default: all)
 *   ?limit = max rows per table per call (default 50, max 500)
 *   ?includeCanonicalEntities=true opt-in when table=all
 *   ?cursor is accepted for operator loops and echoed back; table-specific
 *    keyset pagination is used where direct route queries own the selection.
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

type TableKey = "memory_items" | "observations" | "canonical_entities" | "source_chunks"
const DEFAULT_TABLES: ReadonlyArray<TableKey> = ["memory_items", "observations", "source_chunks"]
const VALID_TABLES: ReadonlyArray<TableKey> = [...DEFAULT_TABLES, "canonical_entities"]

type TableResult = { embedded: number; failed: number; remaining: number; nextCursor?: string | null }

function encodeCursor(row: { created_at?: unknown; id?: unknown } | undefined): string | null {
  if (!row?.created_at || !row.id) return null
  return Buffer.from(JSON.stringify({ createdAt: String(row.created_at), id: String(row.id) }), "utf8").toString("base64url")
}

function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      return { createdAt: parsed.createdAt, id: parsed.id }
    }
  } catch {}
  return null
}

async function backfillCanonicalEntities(
  provider: ReturnType<typeof createRepositoryBundle>["provider"],
  limit: number,
): Promise<TableResult> {
  const rows = (await provider.query(
    `SELECT id, name, kind FROM canonical_entities
     WHERE embedding IS NULL
     ORDER BY created_at ASC
     LIMIT $1::int`,
    [limit],
  )) as Array<{ id: string; name: string; kind: string | null }>

  let embedded = 0
  let failed = 0
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
      failed += 1
      console.error("[embedding-backfill] canonical_entities row failed", row.id, err)
    }
  }

  const remainingRows = (await provider.query(
    `SELECT COUNT(*)::int AS remaining FROM canonical_entities WHERE embedding IS NULL`,
  )) as Array<{ remaining: number }>

  return { embedded, failed, remaining: remainingRows[0]?.remaining ?? 0 }
}

async function backfillSourceChunks(
  provider: ReturnType<typeof createRepositoryBundle>["provider"],
  limit: number,
  cursor: { createdAt: string; id: string } | null = null,
): Promise<TableResult> {
  const rows = (await provider.query(
    `SELECT id, content, created_at FROM source_chunks
     WHERE (embedding IS NULL OR embedding_model IS DISTINCT FROM $1::text)
       AND ($3::timestamptz IS NULL OR (created_at, id) > ($3::timestamptz, $4::uuid))
     ORDER BY created_at ASC
     LIMIT $2::int`,
    [EMBEDDING_MODEL, limit, cursor?.createdAt ?? null, cursor?.id ?? null],
  )) as Array<{ id: string; content: string; created_at: string }>

  let embedded = 0
  let failed = 0
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
      failed += 1
      console.error("[embedding-backfill] source_chunks row failed", row.id, err)
    }
  }

  const remainingRows = (await provider.query(
    `SELECT COUNT(*)::int AS remaining FROM source_chunks
      WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1::text`,
    [EMBEDDING_MODEL],
  )) as Array<{ remaining: number }>

  return { embedded, failed, remaining: remainingRows[0]?.remaining ?? 0, nextCursor: encodeCursor(rows.at(-1)) }
}

async function backfillObservations(
  provider: ReturnType<typeof createRepositoryBundle>["provider"],
  limit: number,
  cursor: { createdAt: string; id: string } | null = null,
): Promise<TableResult> {
  const rows = (await provider.query(
    `SELECT id, content, created_at FROM observations
     WHERE (embedding IS NULL OR embedding_model IS DISTINCT FROM $1::text)
       AND ($3::timestamptz IS NULL OR (created_at, id) > ($3::timestamptz, $4::uuid))
     ORDER BY created_at ASC
     LIMIT $2::int`,
    [EMBEDDING_MODEL, limit, cursor?.createdAt ?? null, cursor?.id ?? null],
  )) as Array<{ id: string; content: string; created_at: string }>

  let embedded = 0
  let failed = 0
  for (const row of rows) {
    try {
      const vector = await generateEmbedding(row.content, "RETRIEVAL_DOCUMENT")
      await provider.query(
        `UPDATE observations
           SET embedding = $2::vector, embedding_model = $3::text
         WHERE id = $1::uuid`,
        [row.id, JSON.stringify(vector), EMBEDDING_MODEL],
      )
      embedded += 1
    } catch (err) {
      failed += 1
      console.error("[embedding-backfill] observations row failed", row.id, err)
    }
  }

  const remainingRows = (await provider.query(
    `SELECT COUNT(*)::int AS remaining FROM observations
      WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1::text`,
    [EMBEDDING_MODEL],
  )) as Array<{ remaining: number }>

  return { embedded, failed, remaining: remainingRows[0]?.remaining ?? 0, nextCursor: encodeCursor(rows.at(-1)) }
}

async function backfillMemoryItems(
  repositories: ReturnType<typeof createRepositoryBundle>,
  limit: number,
): Promise<TableResult> {
  // backfillMissingEmbeddings / backfillStaleEmbeddings return the count of
  // successfully embedded rows. Per-row failures aren't propagated up — they
  // log inside the embedding-service. Compute `failed` from the gap between
  // the rows we attempted (capped by limit) and the rows we embedded.
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
    failed: 0,
    remaining: remainingRows[0]?.remaining ?? 0,
  }
}

async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const rawTable = url.searchParams.get("table")
  // Allow-list `?table`. Unknown name → 400 so an operator typo in the cutover
  // runbook doesn't return 200 with an empty `tables: {}` body that reads as
  // success.
  if (rawTable && rawTable !== "all" && !VALID_TABLES.includes(rawTable as TableKey)) {
    return NextResponse.json(
      { error: `Unknown table '${rawTable}'. Expected one of: ${VALID_TABLES.join(", ")}, all.` },
      { status: 400 },
    )
  }
  const tableParam = (rawTable ?? "all") as TableKey | "all"
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    500,
  )

  const repositories = createWorkerRepositoryBundle()

  const includeCanonicalEntities = url.searchParams.get("includeCanonicalEntities") === "true"
  const tables: TableKey[] = tableParam === "all"
    ? [...DEFAULT_TABLES, ...(includeCanonicalEntities ? ["canonical_entities" as const] : [])]
    : [tableParam]
  const cursor = decodeCursor(url.searchParams.get("cursor"))

  const startedAt = Date.now()
  const results: Record<string, TableResult> = {}

  for (const table of tables) {
    if (table === "memory_items") {
      results[table] = await backfillMemoryItems(repositories, limit)
    } else if (table === "observations") {
      results[table] = await backfillObservations(repositories.provider, limit, cursor)
    } else if (table === "canonical_entities") {
      results[table] = await backfillCanonicalEntities(repositories.provider, limit)
    } else if (table === "source_chunks") {
      results[table] = await backfillSourceChunks(repositories.provider, limit, cursor)
    }
  }

  return NextResponse.json({
    embeddingModel: EMBEDDING_MODEL,
    limit,
    includeCanonicalEntities,
    acceptedCursor: url.searchParams.get("cursor") ?? null,
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
