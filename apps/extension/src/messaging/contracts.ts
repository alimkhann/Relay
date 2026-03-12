export interface RelayProjectOption {
  id: string
  name: string
}

export type RelayRemoteStatus = "loading" | "ready" | "stale" | "unavailable"
export type RelayInsertKind = "fresh_chat_bootstrap" | "quick_continuity"

export interface RelayIssue {
  kind: "network" | "digest" | "unsupported" | "missing_project" | "prompt" | "unknown"
  detail: string
  recoverable: boolean
}

export interface RelayTrustMetadata {
  updatedAt: string | null
  updatedLabel: string | null
  recentChatCount: number
  savedContextCount: number
}

export interface RelayActiveProjectState {
  projectId: string | null
  projectName: string | null
  projectOptions: RelayProjectOption[]
  showCue: boolean
  status: "ready" | "updating" | "unavailable"
  message: string
  trustLine: string
  freshnessText: string | null
  shortcutLabel: string
  canInsert: boolean
  page: RelayPageState
  trust: RelayTrustMetadata
  remoteStatus: RelayRemoteStatus
  issue: RelayIssue | null
  insertKind: RelayInsertKind
  lastSuccessfulSyncAt: string | null
  capturePending: boolean
}

export type RelayMessage =
  | { type: "RELAY_PAGE_STATE" }
  | { type: "RELAY_PAGE_STATE_UPDATE"; payload: RelayPageState }
  | { type: "RELAY_SHOW_INLINE_CHIP"; payload?: { insertKind?: RelayInsertKind } }
  | { type: "RELAY_SHORTCUT_ACTION" }
  | { type: "RELAY_ACTIVE_PROJECT_STATE_CHANGED"; payload: { tabId: number; state: RelayActiveProjectState } }
  | { type: "RELAY_INSERT_CONTEXT"; payload: { content: string } }
  | { type: "RELAY_CAPTURE_VISIBLE"; payload: { projectId: string; tabId?: number } }
  | { type: "RELAY_TRIGGER_AUTO_CAPTURE"; payload: { tabId?: number } }
  | { type: "RELAY_PIN_SELECTION"; payload: { projectId: string; tabId?: number } }
  | { type: "RELAY_GENERATE_BOOTSTRAP"; payload: { projectId: string; targetProfileKey: string; kind: "quick_continuity" | "fresh_chat_bootstrap"; deep?: boolean } }
  | { type: "RELAY_GET_ACTIVE_PROJECT_STATE"; payload?: { tabId?: number } }
  | { type: "RELAY_INSERT_PROJECT_BRIEF"; payload?: { projectId?: string; tabId?: number } }
  | { type: "RELAY_SET_ACTIVE_PROJECT"; payload: { projectId: string; tabId?: number } }
  | { type: "RELAY_REFRESH_SESSION" }
  | { type: "RELAY_OPEN_CONNECT"; payload: { deviceName: string } }
  | { type: "RELAY_GOOGLE_SIGN_IN"; payload: { deviceName: string } }
  | { type: "RELAY_CREATE_PROJECT"; payload: { name: string } }

export interface RelayPageState {
  supported: boolean
  platform?: string
  title?: string | null
  url?: string
  domain?: string
  pathname?: string
  pageFingerprint?: string | null
  turns?: number
  captureSignature?: string
  promptReady?: boolean
  isFreshRoute?: boolean
  isFreshChat?: boolean
  isStable?: boolean
  isStreaming?: boolean
}
