import type { SourceTurnRole, SupportedPlatform } from "./database"

export interface ParsedTurn {
  role: SourceTurnRole
  content: string
  turnIndex: number
  rawHtml?: string | null
}

export interface PageMetadata {
  title: string | null
  url: string
  pathname: string
  pageFingerprint: string | null
  domain: string
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
