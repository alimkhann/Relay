export type RelayMessage =
  | { type: "RELAY_PAGE_STATE" }
  | { type: "RELAY_INSERT_CONTEXT"; payload: { content: string } }
  | { type: "RELAY_CAPTURE_VISIBLE"; payload: { projectId: string; tabId?: number } }
  | { type: "RELAY_PIN_SELECTION"; payload: { projectId: string; tabId?: number } }
  | { type: "RELAY_GENERATE_BOOTSTRAP"; payload: { projectId: string; targetProfileKey: string; kind: "quick_continuity" | "fresh_chat_bootstrap"; deep?: boolean } }
  | { type: "RELAY_REFRESH_SESSION" }
  | { type: "RELAY_OPEN_CONNECT"; payload: { deviceName: string } }

export interface RelayPageState {
  supported: boolean
  platform?: string
  title?: string | null
  url?: string
  turns?: number
  captureSignature?: string
  isFreshChat?: boolean
}
