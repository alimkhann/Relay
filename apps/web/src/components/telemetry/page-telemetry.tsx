"use client"

import { useEffect } from "react"

import type { TelemetrySurface } from "@relay/shared"

import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"

const SESSION_STARTED_KEY = "relay.web.session_started"

export function PageTelemetry({
  surface,
  area,
  pageName,
  pageGroup,
  message,
  context,
  secondaryEvent,
}: {
  surface: TelemetrySurface
  area: string
  pageName: string
  pageGroup?: string
  message: string
  context?: Record<string, unknown>
  secondaryEvent?: string
}) {
  useEffect(() => {
    if (typeof window !== "undefined" && !window.sessionStorage.getItem(SESSION_STARTED_KEY)) {
      window.sessionStorage.setItem(SESSION_STARTED_KEY, "1")
      logClientEvent({
        level: "info",
        surface,
        area,
        event: "session_started",
        flowId: createClientFlowId("web-session"),
        message: "Started a web session.",
        context: {
          pageName,
          pageGroup: pageGroup ?? area,
        },
      })
    }

    logClientEvent({
      level: "info",
      surface,
      area,
      event: "page_viewed",
      message,
      context: {
        pageName,
        pageGroup: pageGroup ?? area,
        ...(context ?? {}),
      }
    })

    if (secondaryEvent) {
      logClientEvent({
        level: "info",
        surface,
        area,
        event: secondaryEvent,
        message,
        context: {
          pageName,
          pageGroup: pageGroup ?? area,
          ...(context ?? {}),
        },
      })
    }
  }, [area, context, message, pageGroup, pageName, secondaryEvent, surface])

  return null
}
