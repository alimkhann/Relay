"use client"

import { useEffect } from "react"

import { logClientEvent } from "@/lib/telemetry/client"

export function GlobalTelemetryBootstrap() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      logClientEvent({
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
      })
    }

    function handleRejection(event: PromiseRejectionEvent) {
      logClientEvent({
        level: "error",
        area: "window",
        event: "window.unhandled_rejection",
        message: "Unhandled promise rejection.",
        error: event.reason
      })
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
