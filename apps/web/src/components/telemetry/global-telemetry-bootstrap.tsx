"use client"

import { useEffect } from "react"

import { flushTelemetryQueue, logClientEvent } from "@/lib/telemetry/client"

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

    function handleUnload() {
      void flushTelemetryQueue()
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)
    window.addEventListener("beforeunload", handleUnload)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
      window.removeEventListener("beforeunload", handleUnload)
    }
  }, [])

  return null
}
