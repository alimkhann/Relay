import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import {
  PIPELINE_VERSION,
  runHygieneTick,
  tick,
  type MemoryPipelineRepos,
  type PipelineProviders,
} from "@relay/memory-pipeline"

import { EMBEDDING_MODEL, generateEmbedding } from "@/server/services/embedding-service"

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

  const repositories = createRepositoryBundle()
  const repos: MemoryPipelineRepos = {
    provider: repositories.provider,
    memory: repositories.memory,
    observation: repositories.observations,
    entityRelation: repositories.entityRelations,
    entity: repositories.entities,
    graph: repositories.graph,
    space: repositories.spaces,
  }

  // Entity + observation extractors land in a follow-up PR (worker full
  // extraction, Gemini prompt design + cost gating). Until then the worker
  // runs embed-only; RELAY_MEMORY_PIPELINE_FULL is reserved but inert.
  const fullExtraction = process.env.RELAY_MEMORY_PIPELINE_FULL === "true"
  const providers: PipelineProviders = {
    embed: async (text: string) => ({
      vector: await generateEmbedding(text),
      model: EMBEDDING_MODEL,
    }),
  }

  const dryRunHygiene = process.env.RELAY_HYGIENE_DRY_RUN !== "false"
  const tickStarted = Date.now()
  const tickResults = await tick(repos, providers, { batchSize: 25 })
  const hygieneStarted = Date.now()
  const hygiene = await runHygieneTick(repos, { dryRun: dryRunHygiene })
  const finishedAt = Date.now()

  return NextResponse.json({
    pipelineVersion: PIPELINE_VERSION,
    tick: {
      processed: tickResults.length,
      durationMs: hygieneStarted - tickStarted,
      results: tickResults,
    },
    hygiene: {
      ...hygiene,
      durationMs: finishedAt - hygieneStarted,
    },
    flags: {
      fullExtraction,
      dryRunHygiene,
    },
  })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
