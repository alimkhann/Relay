import type { TelemetryEventInput } from "@relay/shared"
import { sanitizeTelemetryEvent } from "@relay/shared"

import { getRequestContext } from "./request-context"

function applyRequestContextDefaults(input: TelemetryEventInput): TelemetryEventInput {
  const requestContext = getRequestContext()

  return {
    ...input,
    requestId: input.requestId ?? requestContext?.requestId ?? null,
    flowId: input.flowId ?? requestContext?.flowId ?? null,
    url: input.url ?? requestContext?.path ?? null
  }
}

function writeConsoleEvent(input: TelemetryEventInput) {
  const event = sanitizeTelemetryEvent(applyRequestContextDefaults(input))
  const prefix = `[Relay Server] ${event.surface} ${event.event}`

  if (event.level === "error") {
    console.error(prefix, event)
    return
  }

  if (event.level === "warn") {
    console.warn(prefix, event)
    return
  }

  if (event.level === "debug") {
    console.debug(prefix, event)
    return
  }

  console.info(prefix, event)
}

export async function logServerEvent(input: TelemetryEventInput) {
  writeConsoleEvent(input)
}
