import { createHash } from "node:crypto"

import { createWorkerRepositoryBundle } from "@relay/db"

import { buildRelayAnalyticsPayload } from "@/lib/telemetry/analytics"
import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { estimateGeminiCostUsd } from "./ai-analytics-service"

interface CostSnapshotRecord {
  provider: "gemini" | "vercel" | "neon" | "total"
  sourceType: "ai" | "infra" | "rollup"
  snapshotDate: string
  periodStart: string
  periodEnd: string
  costUsd: number
  estimationMethod: string
  billingMode?: string | null
  externalProjectId?: string | null
  teamId?: string | null
  metrics?: Record<string, number | string | boolean | null>
}

interface UnitEconomicsSnapshotRecord {
  snapshotDate: string
  periodStart: string
  periodEnd: string
  totalUsd: number
  geminiUsd: number
  vercelUsd: number
  neonUsd: number
  activeUsers: number
  activatedUsers: number
  payingActiveUsers: number
  freeActiveUsers: number
  newAccounts: number
  newActivations: number
  captureCount: number
  aiRequestCount: number
  costPerActiveUserUsd: number | null
  costPerActivatedUserUsd: number | null
  costPerPayingUserUsd: number | null
  costPerFreeActiveUserUsd: number | null
  costPerNewActivationUsd: number | null
  costPerCaptureUsd: number | null
  costPerAiRequestUsd: number | null
  aiShareOfTotalCostPct: number | null
  freeUserCostSharePct: number | null
  payingUserCostSharePct: number | null
  vercelBillingMode: string | null
  neonBillingMode: string | null
  billingHealthStatus: string
}

function roundCost(value: number | null | undefined) {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0
  return Math.round(normalized * 1_000_000) / 1_000_000
}

function roundPct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }

  return Math.round(value * 100) / 100
}

function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null
  }

  return roundCost(numerator / denominator)
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function buildSnapshotPeriod(now = new Date()) {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const periodStart = new Date(periodEnd)
  periodStart.setUTCDate(periodStart.getUTCDate() - 1)

  return {
    snapshotDate: toIsoDate(periodStart),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  }
}

function buildStableUuid(value: string) {
  const digest = createHash("sha1").update(value).digest("hex")
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-")
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function sumMetric(rows: Array<Record<string, unknown>>, keys: string[]) {
  return rows.reduce((total, row) => {
    for (const key of keys) {
      if (key in row) {
        return total + normalizeNumber(row[key])
      }
    }

    return total
  }, 0)
}

function parseJsonLikeText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const lines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length) {
      return null
    }

    const entries = lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })

    return entries.length ? { rows: entries } : null
  }
}

async function buildGeminiCostSnapshot(period: ReturnType<typeof buildSnapshotPeriod>): Promise<CostSnapshotRecord> {
  const repositories = createWorkerRepositoryBundle()
  const rows = await repositories.provider.query<{
    status: string
    actual_model: string | null
    token_usage: Record<string, unknown> | null
    started_at: string | null
    completed_at: string | null
  }>(
    `select
       status,
       actual_model,
       token_usage,
       started_at,
       completed_at
     from ai_job_runs
     where created_at >= $1::timestamptz
       and created_at < $2::timestamptz
       and actual_model is not null
       and actual_model <> 'deterministic'`,
    [period.periodStart, period.periodEnd]
  )

  let costUsd = 0
  let tokensIn = 0
  let tokensOut = 0
  let tokensTotal = 0
  let successCount = 0
  let failureCount = 0
  let latencyTotal = 0
  let latencyCount = 0

  for (const row of rows) {
    const tokenUsage = row.token_usage as
      | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
      | null
    const pricing = estimateGeminiCostUsd({
      model: row.actual_model,
      tokenUsage,
    })

    costUsd += pricing.estimatedCostUsd
    tokensIn += normalizeNumber(tokenUsage?.inputTokens)
    tokensOut += normalizeNumber(tokenUsage?.outputTokens)
    tokensTotal += normalizeNumber(tokenUsage?.totalTokens)

    if (row.status === "completed") {
      successCount += 1
    } else if (row.status === "failed" || row.status === "timed_out") {
      failureCount += 1
    }

    if (row.started_at && row.completed_at) {
      const duration = new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
      if (Number.isFinite(duration) && duration >= 0) {
        latencyTotal += duration
        latencyCount += 1
      }
    }
  }

  return {
    provider: "gemini",
    sourceType: "ai",
    snapshotDate: period.snapshotDate,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    costUsd: roundCost(costUsd),
    estimationMethod: "gemini_pricing_table",
    billingMode: "token_estimated",
    metrics: {
      requestsCount: rows.length,
      successCount,
      failureCount,
      tokensIn,
      tokensOut,
      tokensTotal,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencyTotal / latencyCount) : 0,
    },
  }
}

async function buildVercelCostSnapshot(period: ReturnType<typeof buildSnapshotPeriod>): Promise<CostSnapshotRecord> {
  const token = process.env["VERCEL_API_TOKEN"] ?? null
  const teamId = process.env["VERCEL_TEAM_ID"] ?? null
  const projectId = process.env["VERCEL_PROJECT_ID"] ?? null

  if (!token) {
    return {
      provider: "vercel",
      sourceType: "infra",
      snapshotDate: period.snapshotDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      costUsd: 0,
      estimationMethod: "provider_api_missing",
      billingMode: "unconfigured",
      externalProjectId: projectId,
      teamId,
    }
  }

  const endpoint = new URL("https://api.vercel.com/v1/billing/charges")
  endpoint.searchParams.set("from", period.periodStart)
  endpoint.searchParams.set("to", period.periodEnd)
  if (teamId) {
    endpoint.searchParams.set("teamId", teamId)
  }
  if (projectId) {
    endpoint.searchParams.set("projectId", projectId)
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    })

    if (response.status === 403 || response.status === 404) {
      return {
        provider: "vercel",
        sourceType: "infra",
        snapshotDate: period.snapshotDate,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        costUsd: 0,
        estimationMethod: "hobby_or_billing_api_unavailable",
        billingMode: "hobby",
        externalProjectId: projectId,
        teamId,
        metrics: {
          status: response.status,
        },
      }
    }

    const text = await response.text()
    const payload = parseJsonLikeText(text)

    if (!response.ok) {
      return {
        provider: "vercel",
        sourceType: "infra",
        snapshotDate: period.snapshotDate,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        costUsd: 0,
        estimationMethod: `provider_api_error_${response.status}`,
        billingMode: "billing_api_error",
        externalProjectId: projectId,
        teamId,
      }
    }

    const rows = ((payload as { rows?: Array<Record<string, unknown>> } | null)?.rows ??
      (payload as { charges?: Array<Record<string, unknown>> } | null)?.charges ??
      (payload as { data?: Array<Record<string, unknown>> } | null)?.data ??
      []) as Array<Record<string, unknown>>
    const costUsd = rows.length
      ? sumMetric(rows, ["BilledCost", "billedCost", "billed_cost", "cost", "amount"])
      : sumMetric([((payload as Record<string, unknown> | null) ?? {})], ["BilledCost", "billedCost", "billed_cost", "cost", "amount"])

    return {
      provider: "vercel",
      sourceType: "infra",
      snapshotDate: period.snapshotDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      costUsd: roundCost(costUsd),
      estimationMethod: "vercel_billing_charges_api",
      billingMode: "billed",
      externalProjectId: projectId,
      teamId,
      metrics: {
        vercelFunctionInvocations: sumMetric(rows, ["invocations", "functionInvocations", "function_invocations"]),
        vercelFunctionDurationMs: sumMetric(rows, ["durationMs", "duration_ms", "executionTimeMs"]),
        vercelBandwidthBytes: sumMetric(rows, ["bandwidthBytes", "bandwidth_bytes", "bytes"]),
      },
    }
  } catch {
    return {
      provider: "vercel",
      sourceType: "infra",
      snapshotDate: period.snapshotDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      costUsd: 0,
      estimationMethod: "provider_api_exception",
      billingMode: "billing_api_exception",
      externalProjectId: projectId,
      teamId,
    }
  }
}

function buildNeonCounterMetrics(payload: Record<string, unknown>) {
  return {
    computeTimeSeconds: normalizeNumber(payload.compute_time_seconds),
    activeTimeSeconds: normalizeNumber(payload.active_time_seconds),
    writtenDataBytes: normalizeNumber(payload.written_data_bytes),
    dataTransferBytes: normalizeNumber(payload.data_transfer_bytes),
    syntheticStorageSize: normalizeNumber(payload.synthetic_storage_size),
  }
}

function buildNeonMetricDelta(current: Record<string, number>, previous: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(current).map(([key, value]) => [
      key,
      Math.max(0, value - normalizeNumber(previous[key])),
    ])
  ) as Record<string, number>
}

async function buildNeonFallbackSnapshot(
  period: ReturnType<typeof buildSnapshotPeriod>,
  apiKey: string,
  projectId: string,
): Promise<CostSnapshotRecord> {
  const repositories = createWorkerRepositoryBundle()
  const response = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  })

  if (!response.ok) {
    return {
      provider: "neon",
      sourceType: "infra",
      snapshotDate: period.snapshotDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      costUsd: 0,
      estimationMethod: `provider_api_error_${response.status}`,
      billingMode: "project_counter_error",
      externalProjectId: projectId,
    }
  }

  const payload = (await response.json()) as { project?: Record<string, unknown> }
  const project = payload.project ?? {}
  const currentCumulative = buildNeonCounterMetrics(project)
  const previous = await repositories.providerCounterSnapshots.getLatest("neon", projectId, period.snapshotDate)
  const previousCumulative = ((previous?.metrics?.["cumulative"] as Record<string, unknown> | undefined) ??
    {}) as Record<string, unknown>
  const delta = buildNeonMetricDelta(currentCumulative, {
    computeTimeSeconds: normalizeNumber(previousCumulative["computeTimeSeconds"]),
    activeTimeSeconds: normalizeNumber(previousCumulative["activeTimeSeconds"]),
    writtenDataBytes: normalizeNumber(previousCumulative["writtenDataBytes"]),
    dataTransferBytes: normalizeNumber(previousCumulative["dataTransferBytes"]),
    syntheticStorageSize: normalizeNumber(previousCumulative["syntheticStorageSize"]),
  })

  await repositories.providerCounterSnapshots.upsertDailySnapshot({
    provider: "neon",
    externalProjectId: projectId,
    snapshotDate: period.snapshotDate,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    billingMode: String(project["branch_logical_size_limit_bytes"] ? "project_counter_delta" : "launch_v3"),
    estimationMethod: "project_counter_delta_unpriced",
    costUsd: 0,
    metrics: {
      cumulative: currentCumulative,
      delta,
    },
  })

  return {
    provider: "neon",
    sourceType: "infra",
    snapshotDate: period.snapshotDate,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    costUsd: 0,
    estimationMethod: "project_counter_delta_unpriced",
    billingMode: typeof project["subscription_type"] === "string" ? String(project["subscription_type"]) : "launch_v3",
    externalProjectId: projectId,
    metrics: {
      neonComputeTimeSeconds: delta.computeTimeSeconds ?? 0,
      neonActiveTimeSeconds: delta.activeTimeSeconds ?? 0,
      neonWrittenDataBytes: delta.writtenDataBytes ?? 0,
      neonDataTransferBytes: delta.dataTransferBytes ?? 0,
      neonSyntheticStorageSize: delta.syntheticStorageSize ?? 0,
    },
  }
}

async function buildNeonCostSnapshot(period: ReturnType<typeof buildSnapshotPeriod>): Promise<CostSnapshotRecord> {
  const apiKey = process.env["NEON_API_KEY"] ?? null
  const orgId = process.env["NEON_ORG_ID"] ?? null
  const projectId = process.env["NEON_PROJECT_ID"] ?? process.env["NEON_PROJECT_IDS"]?.split(",")[0]?.trim() ?? null

  if (!apiKey || !projectId) {
    return {
      provider: "neon",
      sourceType: "infra",
      snapshotDate: period.snapshotDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      costUsd: 0,
      estimationMethod: "provider_api_missing",
      billingMode: "unconfigured",
      externalProjectId: projectId,
    }
  }

  const endpoint = new URL("https://console.neon.tech/api/v2/consumption_history/projects")
  endpoint.searchParams.set("from", period.periodStart)
  endpoint.searchParams.set("to", period.periodEnd)
  endpoint.searchParams.set("granularity", "daily")
  endpoint.searchParams.set(
    "metrics",
    [
      "active_time_seconds",
      "compute_time_seconds",
      "written_data_bytes",
      "data_storage_bytes_hour",
      "logical_size_bytes",
    ].join(",")
  )
  endpoint.searchParams.set("project_ids", projectId)
  if (orgId) {
    endpoint.searchParams.set("org_id", orgId)
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
    })

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>
      const projects = (Array.isArray(payload.projects)
        ? payload.projects
        : Array.isArray(payload.data)
          ? payload.data
          : []) as Array<Record<string, unknown>>
      const history = projects.flatMap((project) => {
        const items = project.history
        return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : []
      })

      return {
        provider: "neon",
        sourceType: "infra",
        snapshotDate: period.snapshotDate,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        costUsd: 0,
        estimationMethod: "consumption_only_unpriced",
        billingMode: "consumption_history",
        externalProjectId: projectId,
        metrics: {
          neonComputeTimeSeconds: sumMetric(history, ["compute_time_seconds", "computeTimeSeconds"]),
          neonActiveTimeSeconds: sumMetric(history, ["active_time_seconds", "activeTimeSeconds"]),
          neonWrittenDataBytes: sumMetric(history, ["written_data_bytes", "writtenDataBytes"]),
          neonStorageBytesHour: sumMetric(history, ["data_storage_bytes_hour", "dataStorageBytesHour"]),
          neonLogicalSizeBytes: sumMetric(history, ["logical_size_bytes", "logicalSizeBytes"]),
        },
      }
    }

    if (response.status === 400 || response.status === 403 || response.status === 404) {
      return buildNeonFallbackSnapshot(period, apiKey, projectId)
    }

    return {
      provider: "neon",
      sourceType: "infra",
      snapshotDate: period.snapshotDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      costUsd: 0,
      estimationMethod: `provider_api_error_${response.status}`,
      billingMode: "provider_api_error",
      externalProjectId: projectId,
    }
  } catch {
    return buildNeonFallbackSnapshot(period, apiKey, projectId)
  }
}

async function emitCostSnapshot(snapshot: CostSnapshotRecord) {
  const payload = buildRelayAnalyticsPayload(
    {
      level: "info",
      surface: "web-api",
      area: "costs",
      event: "cost_snapshot",
      message: `Captured ${snapshot.provider} cost snapshot for ${snapshot.snapshotDate}.`,
      timestamp: snapshot.periodEnd,
      context: {
        provider: snapshot.provider,
        sourceType: snapshot.sourceType,
        period: "day",
        snapshotDate: snapshot.snapshotDate,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        costUsd: snapshot.costUsd,
        currency: "USD",
        estimationMethod: snapshot.estimationMethod,
        billingMode: snapshot.billingMode ?? null,
        teamId: snapshot.teamId ?? null,
        externalProjectId: snapshot.externalProjectId ?? null,
        ...(snapshot.metrics ?? {}),
      },
    },
    {
      mode: "server",
      pathname: "/api/internal/jobs/cron",
    }
  )

  captureServerEvent({
    event: payload.event,
    distinctId: "relay-cost-monitor",
    properties: payload.properties,
    timestamp: snapshot.periodEnd,
    uuid: buildStableUuid(`${snapshot.provider}:${snapshot.snapshotDate}:${snapshot.estimationMethod}`),
  })
}

async function buildUnitEconomicsSnapshot(
  period: ReturnType<typeof buildSnapshotPeriod>,
  snapshots: {
    gemini: CostSnapshotRecord
    vercel: CostSnapshotRecord
    neon: CostSnapshotRecord
    total: CostSnapshotRecord
  },
): Promise<UnitEconomicsSnapshotRecord> {
  const repositories = createWorkerRepositoryBundle()
  const [counts] = await repositories.provider.query<{
    active_users: number
    activated_users: number
    paying_active_users: number
    free_active_users: number
    new_accounts: number
    new_activations: number
    capture_count: number
    ai_request_count: number
  }>(
    `with active_users as (
       select distinct user_id
       from (
         select user_id
         from capture_events
         where created_at >= $1::timestamptz
           and created_at < $2::timestamptz
         union
         select created_by as user_id
         from ai_job_runs
         where created_at >= $1::timestamptz
           and created_at < $2::timestamptz
           and actual_model is not null
           and actual_model <> 'deterministic'
         union
         select user_id
         from work_session_events
         where created_at >= $1::timestamptz
           and created_at < $2::timestamptz
       ) unified
     ),
     first_activations as (
       select user_id, min(created_at) as first_capture_at
       from capture_events
       where event_type = 'session_captured'
       group by user_id
     ),
     current_entitlements as (
       select distinct on (user_id)
         user_id,
         plan_key,
         status
       from entitlements
       order by user_id, updated_at desc
     )
     select
       (select count(*)::int from active_users) as active_users,
       (select count(distinct user_id)::int
        from capture_events
        where event_type = 'session_captured'
          and created_at < $2::timestamptz) as activated_users,
       (select count(*)::int
        from active_users au
        join current_entitlements ce on ce.user_id = au.user_id
        where ce.plan_key <> 'free'
          and ce.status in ('active', 'trialing', 'past_due')) as paying_active_users,
       (select count(*)::int
        from active_users au
        left join current_entitlements ce on ce.user_id = au.user_id
        where coalesce(ce.plan_key, 'free') = 'free'
           or coalesce(ce.status, 'inactive') not in ('active', 'trialing', 'past_due')) as free_active_users,
       (select count(*)::int
        from profiles
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz) as new_accounts,
       (select count(*)::int
        from first_activations
        where first_capture_at >= $1::timestamptz
          and first_capture_at < $2::timestamptz) as new_activations,
       (select count(*)::int
        from capture_events
        where event_type = 'session_captured'
          and created_at >= $1::timestamptz
          and created_at < $2::timestamptz) as capture_count,
       (select count(*)::int
        from ai_job_runs
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
          and actual_model is not null
          and actual_model <> 'deterministic') as ai_request_count`,
    [period.periodStart, period.periodEnd]
  )

  const activeUsers = Number(counts?.active_users ?? 0)
  const activatedUsers = Number(counts?.activated_users ?? 0)
  const payingActiveUsers = Number(counts?.paying_active_users ?? 0)
  const freeActiveUsers = Number(counts?.free_active_users ?? 0)
  const newAccounts = Number(counts?.new_accounts ?? 0)
  const newActivations = Number(counts?.new_activations ?? 0)
  const captureCount = Number(counts?.capture_count ?? 0)
  const aiRequestCount = Number(counts?.ai_request_count ?? 0)
  const totalUsd = roundCost(snapshots.total.costUsd)
  const freeUserCostSharePct = activeUsers > 0 ? roundPct((freeActiveUsers / activeUsers) * 100) : null
  const payingUserCostSharePct = activeUsers > 0 ? roundPct((payingActiveUsers / activeUsers) * 100) : null

  let billingHealthStatus = "complete"
  if (snapshots.vercel.estimationMethod !== "vercel_billing_charges_api") {
    billingHealthStatus = "vercel_partial"
  }
  if (snapshots.neon.estimationMethod !== "consumption_only_unpriced" && snapshots.neon.estimationMethod !== "project_counter_delta_unpriced") {
    billingHealthStatus = billingHealthStatus === "complete" ? "neon_partial" : "partial"
  }
  if (snapshots.vercel.estimationMethod !== "vercel_billing_charges_api" && snapshots.neon.estimationMethod !== "consumption_only_unpriced" && snapshots.neon.estimationMethod !== "project_counter_delta_unpriced") {
    billingHealthStatus = "partial"
  }

  return {
    snapshotDate: period.snapshotDate,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    totalUsd,
    geminiUsd: roundCost(snapshots.gemini.costUsd),
    vercelUsd: roundCost(snapshots.vercel.costUsd),
    neonUsd: roundCost(snapshots.neon.costUsd),
    activeUsers,
    activatedUsers,
    payingActiveUsers,
    freeActiveUsers,
    newAccounts,
    newActivations,
    captureCount,
    aiRequestCount,
    costPerActiveUserUsd: safeDivide(totalUsd, activeUsers),
    costPerActivatedUserUsd: safeDivide(totalUsd, activatedUsers),
    costPerPayingUserUsd: safeDivide(totalUsd, payingActiveUsers),
    costPerFreeActiveUserUsd: safeDivide(totalUsd, freeActiveUsers),
    costPerNewActivationUsd: safeDivide(totalUsd, newActivations),
    costPerCaptureUsd: safeDivide(totalUsd, captureCount),
    costPerAiRequestUsd: safeDivide(totalUsd, aiRequestCount),
    aiShareOfTotalCostPct: totalUsd > 0 ? roundPct((snapshots.gemini.costUsd / totalUsd) * 100) : null,
    freeUserCostSharePct,
    payingUserCostSharePct,
    vercelBillingMode: snapshots.vercel.billingMode ?? null,
    neonBillingMode: snapshots.neon.billingMode ?? null,
    billingHealthStatus,
  }
}

async function emitUnitEconomicsSnapshot(snapshot: UnitEconomicsSnapshotRecord) {
  const payload = buildRelayAnalyticsPayload(
    {
      level: "info",
      surface: "web-api",
      area: "costs",
      event: "unit_economics_snapshot",
      message: `Captured unit economics snapshot for ${snapshot.snapshotDate}.`,
      timestamp: snapshot.periodEnd,
      context: {
        snapshotDate: snapshot.snapshotDate,
        period: "day",
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        totalUsd: snapshot.totalUsd,
        geminiUsd: snapshot.geminiUsd,
        vercelUsd: snapshot.vercelUsd,
        neonUsd: snapshot.neonUsd,
        activeUsers: snapshot.activeUsers,
        activatedUsers: snapshot.activatedUsers,
        payingActiveUsers: snapshot.payingActiveUsers,
        freeActiveUsers: snapshot.freeActiveUsers,
        newAccounts: snapshot.newAccounts,
        newActivations: snapshot.newActivations,
        captureCount: snapshot.captureCount,
        aiRequestCount: snapshot.aiRequestCount,
        costPerActiveUserUsd: snapshot.costPerActiveUserUsd,
        costPerActivatedUserUsd: snapshot.costPerActivatedUserUsd,
        costPerPayingUserUsd: snapshot.costPerPayingUserUsd,
        costPerFreeActiveUserUsd: snapshot.costPerFreeActiveUserUsd,
        costPerNewActivationUsd: snapshot.costPerNewActivationUsd,
        costPerCaptureUsd: snapshot.costPerCaptureUsd,
        costPerAiRequestUsd: snapshot.costPerAiRequestUsd,
        aiShareOfTotalCostPct: snapshot.aiShareOfTotalCostPct,
        freeUserCostSharePct: snapshot.freeUserCostSharePct,
        payingUserCostSharePct: snapshot.payingUserCostSharePct,
        vercelBillingMode: snapshot.vercelBillingMode,
        neonBillingMode: snapshot.neonBillingMode,
        billingHealthStatus: snapshot.billingHealthStatus,
      },
    },
    {
      mode: "server",
      pathname: "/api/internal/jobs/cron",
    }
  )

  captureServerEvent({
    event: payload.event,
    distinctId: "relay-cost-monitor",
    properties: payload.properties,
    timestamp: snapshot.periodEnd,
    uuid: buildStableUuid(`unit-economics:${snapshot.snapshotDate}`),
  })
}

export async function emitDailyCostSnapshots(now = new Date()) {
  const period = buildSnapshotPeriod(now)
  const gemini = await buildGeminiCostSnapshot(period)
  const vercel = await buildVercelCostSnapshot(period)
  const neon = await buildNeonCostSnapshot(period)
  const total: CostSnapshotRecord = {
    provider: "total",
    sourceType: "rollup",
    snapshotDate: period.snapshotDate,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    costUsd: roundCost(gemini.costUsd + vercel.costUsd + neon.costUsd),
    estimationMethod: "rollup",
    billingMode: "rollup",
    metrics: {
      geminiUsd: gemini.costUsd,
      vercelUsd: vercel.costUsd,
      neonUsd: neon.costUsd,
      totalUsd: roundCost(gemini.costUsd + vercel.costUsd + neon.costUsd),
    },
  }
  const unitEconomics = await buildUnitEconomicsSnapshot(period, {
    gemini,
    vercel,
    neon,
    total,
  })

  await Promise.all([
    emitCostSnapshot(gemini),
    emitCostSnapshot(vercel),
    emitCostSnapshot(neon),
    emitCostSnapshot(total),
    emitUnitEconomicsSnapshot(unitEconomics),
  ])

  return { gemini, vercel, neon, total, unitEconomics }
}
