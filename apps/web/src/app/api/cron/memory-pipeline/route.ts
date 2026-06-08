import { NextResponse } from "next/server"

// A FULL tick with Gemini extractors runs ~3 min over a 25-item batch
// (HANDOFF §7 drain stats). Default Vercel timeout is too tight.
export const maxDuration = 300

import {
  drainDueProjectHygiene,
  drainMemoryPipelineJobs,
} from "@/server/services/memory-pipeline-scheduler"

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
