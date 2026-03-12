import type { TelemetryEventInput } from "@relay/shared"
import { createRepositoryBundle, type TelemetryLogFilters } from "@relay/db"
import { sanitizeTelemetryEvent } from "@relay/shared"

import { getRequestContext } from "./request-context"

const TELEMETRY_RETENTION_DAYS = 30
const CLEANUP_INTERVAL_MS = 1000 * 60 * 30

let lastCleanupAt = 0

async function maybeCleanupTelemetryLogs() {
  if (Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return
  }

  lastCleanupAt = Date.now()

  try {
    const repositories = createRepositoryBundle()
    await repositories.telemetryLogs.cleanupOlderThan(TELEMETRY_RETENTION_DAYS)
  } catch (error) {
    console.error("[Relay Web] telemetry cleanup failed", error)
    lastCleanupAt = 0
  }
}

function applyRequestContextDefaults(input: TelemetryEventInput): TelemetryEventInput {
  const requestContext = getRequestContext()

  return {
    ...input,
    requestId: input.requestId ?? requestContext?.requestId ?? null,
    flowId: input.flowId ?? requestContext?.flowId ?? null,
    url: input.url ?? requestContext?.path ?? null
  }
}

export async function ingestTelemetryLogs(logs: TelemetryEventInput[]) {
  if (logs.length === 0) return

  try {
    const repositories = createRepositoryBundle()
    await repositories.telemetryLogs.createMany(
      logs.map((log) => sanitizeTelemetryEvent(applyRequestContextDefaults(log)))
    )
    void maybeCleanupTelemetryLogs()
  } catch (error) {
    console.error("[Relay Web] telemetry write failed", error)
  }
}

export async function logServerEvent(input: TelemetryEventInput) {
  await ingestTelemetryLogs([input])
}

export async function listTelemetryLogs(filters: TelemetryLogFilters = {}) {
  const repositories = createRepositoryBundle()
  return repositories.telemetryLogs.list(filters)
}
