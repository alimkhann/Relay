import type { SourceTurnRole, SupportedPlatform } from "./database"

export type CaptureSource = "dom" | "network" | "merged"

export interface ParsedTurn {
  role: SourceTurnRole
  content: string
  turnIndex: number
  rawHtml?: string | null
  captureSource?: CaptureSource
}

export type PageRouteKind = "fresh" | "chat" | "project_root" | "unknown"

export interface PageMetadata {
  title: string | null
  url: string
  pathname: string
  pageFingerprint: string | null
  domain: string
  routeKind?: PageRouteKind
}

export interface CapturePayload {
  projectId: string
  platform: SupportedPlatform
  session: {
    title: string | null
    url: string
    tabId?: string | null
    windowId?: string | null
    pageFingerprint?: string | null
    captureSignature?: string | null
    metadata?: Record<string, unknown>
  }
  turns: ParsedTurn[]
}
