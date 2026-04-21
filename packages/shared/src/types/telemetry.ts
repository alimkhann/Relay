export const telemetryLevels = ["debug", "info", "warn", "error"] as const
export const telemetrySurfaces = [
  "web-landing",
  "web-dashboard",
  "web-settings",
  "web-auth",
  "web-api",
  "extension-background",
  "extension-sidebar",
  "extension-inline-chip",
  "cli",
  "mcp",
  "wizard",
] as const

export type TelemetryLevel = (typeof telemetryLevels)[number]
export type TelemetrySurface = (typeof telemetrySurfaces)[number]

export interface TelemetryErrorPayload {
  name?: string | null
  message?: string | null
  stack?: string | null
  cause?: string | null
}

export interface TelemetryEventInput {
  timestamp?: string
  level: TelemetryLevel
  surface: TelemetrySurface
  area: string
  event: string
  message: string
  requestId?: string | null
  flowId?: string | null
  userId?: string | null
  projectId?: string | null
  sessionId?: string | null
  tabId?: number | null
  url?: string | null
  context?: Record<string, unknown>
  error?: unknown
}
