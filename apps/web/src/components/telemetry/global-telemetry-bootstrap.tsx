"use client"

import { useEffect } from "react"

import { logClientEvent } from "@/lib/telemetry/client"
import { reportClientError } from "@/lib/telemetry/client-error-reporting"

export function GlobalTelemetryBootstrap() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      const payload = {
        level: "error",
        area: "window",
        event: "window.error",
        message: event.message || "Unhandled browser error.",
        error: event.error ?? event.message,
        context: {
          filename: event.filename,
          line: event.lineno,
          column: event.colno
        }
      } as const

      logClientEvent(payload)
      reportClientError(payload)
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const payload = {
        level: "error",
        area: "window",
        event: "window.unhandled_rejection",
        message: "Unhandled promise rejection.",
        error: event.reason
      } as const

      logClientEvent(payload)
      reportClientError(payload)
    }
    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  return null
}
