import { NextResponse } from "next/server"

// A FULL tick with Gemini extractors runs ~3 min over a 25-item batch
// (HANDOFF §7 drain stats). Default Vercel timeout is too tight.
export const maxDuration = 300

import { createWorkerRepositoryBundle } from "@relay/db"

import {
  drainDueProjectHygiene,
  drainMemoryPipelineJobs,
} from "@/server/services/memory-pipeline-scheduler"

const REENQUEUE_DEFAULT_LIMIT = 100
const REENQUEUE_MAX_LIMIT = 500

/**
 * Bounded, operator-driven re-enqueue of legacy v1 memory items for v2
 * extraction (replaces the auto full-prod UPDATE that used to live in migration
 * 0049). Flips at most `limit` done/version<2 rows to 'pending' per call so the
 * worker re-extracts them, and returns { flipped, remaining } so an operator can
 * loop until remaining=0 — pacing against RELAY_PIPELINE_DAILY_USD_CAP.
 *
 * Refuses unless RELAY_MEMORY_PIPELINE_FULL=true: flipping rows the embed-only
 * worker can't extract would strand them in 'pending' forever.
 */
async function reenqueue(limitParam: string | null): Promise<Response> {
  if (process.env.RELAY_MEMORY_PIPELINE_FULL !== "true") {
    return NextResponse.json(
      {
        error:
          "Refusing to re-enqueue while RELAY_MEMORY_PIPELINE_FULL is not 'true' — flipped rows would never be extracted.",
      },
      { status: 409 },
    )
  }
  const parsed = Number.parseInt(limitParam ?? "", 10)
  const limit = Math.min(
    Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : REENQUEUE_DEFAULT_LIMIT, 1),
    REENQUEUE_MAX_LIMIT,
  )
  const repositories = createWorkerRepositoryBundle()
  const flippedRows = await repositories.provider.query<{ flipped: number }>(
    `with picked as (
       select id from memory_items
       where enrichment_status = 'done' and enrichment_version < 2
       order by created_at asc
       limit $1
     )
     update memory_items m set enrichment_status = 'pending'
     from picked where m.id = picked.id
     returning 1 as flipped`,
    [limit],
  )
  const remainingRows = await repositories.provider.query<{ remaining: number }>(
    `select count(*)::int as remaining from memory_items
     where enrichment_status = 'done' and enrichment_version < 2`,
  )
  return NextResponse.json({
    reenqueue: {
      flipped: flippedRows.length,
      remaining: remainingRows[0]?.remaining ?? 0,
      limit,
    },
  })
}

/**
 * Cron entry for the memory-pipeline worker.
 *
 * - GET (or POST) /api/cron/memory-pipeline → runs one tick + one hygiene sweep.
 *
 * Authorization: protected by Vercel cron header. If you wire this up in
 * `vercel.json`, the CRON_SECRET env var is automatically sent as the
 * `Authorization` header. For ad-hoc manual runs include the same secret.
 *
 * NOTE: this first cut keeps the worker conservative — entity + observation
 * extraction are gated behind RELAY_MEMORY_PIPELINE_FULL=true so the cron
 * can be deployed safely without a Gemini prompt design pass. Until that env
 * is set, the worker only embeds new rows + sweeps decay.
 */

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail-closed in production: an unset secret must never expose the cron
    // to the open internet. Local + dev allow unauthenticated runs.
    if (process.env.NODE_ENV === "production") return false
    console.warn(
      "[memory-pipeline cron] CRON_SECRET unset — allowing unauthenticated run (non-production only).",
    )
    return true
  }
  const auth = request.headers.get("authorization") ?? ""
  return auth === `Bearer ${secret}`
}

async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get("reenqueue") === "1") {
    return reenqueue(url.searchParams.get("limit"))
  }

  const dryRunHygiene = process.env.RELAY_HYGIENE_DRY_RUN !== "false"
  const jobsStarted = Date.now()
  const jobs = await drainMemoryPipelineJobs({ limit: 25, maxMs: 180_000 })
  const hygieneStarted = Date.now()
  const hygiene = await drainDueProjectHygiene({ limit: 10, maxMs: 90_000, dryRun: dryRunHygiene })
  const finishedAt = Date.now()

  return NextResponse.json({
    jobs: {
      ...jobs,
      durationMs: hygieneStarted - jobsStarted,
    },
    hygiene: {
      ...hygiene,
      durationMs: finishedAt - hygieneStarted,
    },
    flags: { ...jobs.flags, dryRunHygiene },
    budget: jobs.budget,
  })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
