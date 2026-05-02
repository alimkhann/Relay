import type { TelemetryEventInput } from "@relay/shared"
import { buildPosthogExceptionProperties, sanitizeTelemetryEvent, shouldCapturePosthogException } from "@relay/shared"

import { captureServerException, captureServerTelemetry } from "@/lib/telemetry/posthog-server"

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

function shouldForwardServerEventToPosthog(input: TelemetryEventInput) {
  return input.level !== "debug" && input.event !== "api.response"
}

function isClientReportedEvent(input: TelemetryEventInput) {
  return input.context?.reportedVia === "client-report"
}

export async function logServerEvent(input: TelemetryEventInput) {
  const event = sanitizeTelemetryEvent(applyRequestContextDefaults(input))

  writeConsoleEvent(event)

  if (!isClientReportedEvent(event) && shouldForwardServerEventToPosthog(event)) {
    captureServerTelemetry(event)
  }

  if (!isClientReportedEvent(event) && shouldCapturePosthogException(event) && event.event !== "api.exception") {
    captureServerException(event.error ?? event.message, {
      distinctId: event.userId,
      properties: buildPosthogExceptionProperties(event),
    })
  }
}
