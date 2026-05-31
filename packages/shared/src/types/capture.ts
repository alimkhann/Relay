import type { SourceTurnRole, SupportedPlatform } from "./database"

export type CaptureSource = "dom" | "network" | "merged"

export type RelayInsertedContextKind = "fresh_chat_bootstrap" | "quick_continuity"
export type RelayInsertedContextDeltaKind = "unchanged" | "appended" | "edited" | "assistant_only"
export type RelayInsertedContextAssistantOutcome =
  | "none"
  | "dropped_ack"
  | "dropped_overlap"
  | "kept_novel"

export interface RelayInsertedContextMetadata {
  kind: RelayInsertedContextKind
  packetId?: string | null
  insertedContentHash: string
  deltaKind: RelayInsertedContextDeltaKind
  rawTurnCount: number
  filteredTurnCount: number
  assistantOutcome: RelayInsertedContextAssistantOutcome
}

export interface CaptureSessionMetadata extends Record<string, unknown> {
  relayInsertedContext?: RelayInsertedContextMetadata
}

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
  /** Multi-project capture: extra projects to link this session to (origin implied). */
  additionalProjectIds?: string[]
  platform: SupportedPlatform
  processingMode?: "default" | "fast_ack"
  session: {
    title: string | null
    url: string
    tabId?: string | null
    windowId?: string | null
    pageFingerprint?: string | null
    captureSignature?: string | null
    sourceConversationId?: string | null
    metadata?: CaptureSessionMetadata
  }
  turns: ParsedTurn[]
}
