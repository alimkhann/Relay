"use client"

import type { TelemetrySurface } from "@relay/shared"

import { logClientEvent } from "./client"

interface RelayClientFetchOptions extends RequestInit {
  telemetry?: {
    surface?: TelemetrySurface
    area: string
    event: string
    flowId?: string | null
    context?: Record<string, unknown>
    logSuccess?: boolean
  }
}

export async function relayClientFetch(input: string, init: RelayClientFetchOptions = {}) {
  const { telemetry, headers, ...requestInit } = init

  try {
    const response = await fetch(input, {
      ...requestInit,
      headers: {
        ...(telemetry?.flowId ? { "x-relay-flow-id": telemetry.flowId } : {}),
        ...(headers ?? {})
      }
    })

    if (telemetry && (telemetry.logSuccess || !response.ok)) {
      logClientEvent({
        level: response.ok ? "info" : "warn",
        surface: telemetry.surface,
        area: telemetry.area,
        event: telemetry.event,
        flowId: telemetry.flowId ?? null,
        message: `${requestInit.method ?? "GET"} ${input} -> ${response.status}`,
        context: {
          ...(telemetry.context ?? {}),
          status: response.status
        }
      })
    }

    return response
  } catch (error) {
    if (telemetry) {
      logClientEvent({
        level: "error",
        surface: telemetry.surface,
        area: telemetry.area,
        event: `${telemetry.event}.failed`,
        flowId: telemetry.flowId ?? null,
        message: `${requestInit.method ?? "GET"} ${input} failed`,
        context: telemetry.context,
        error
      })
    }

    throw error
  }
}
