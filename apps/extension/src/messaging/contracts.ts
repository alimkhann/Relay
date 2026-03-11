export type RelayMessage =
  | { type: "RELAY_PAGE_STATE" }
  | { type: "RELAY_INSERT_CONTEXT"; payload: { content: string } }
  | { type: "RELAY_CAPTURE_VISIBLE"; payload: { projectId: string; tabId?: number } }
  | { type: "RELAY_BIND_PROJECT"; payload: { projectId: string; tabId?: string; domain?: string } }
  | { type: "RELAY_COMPOSE_CONTEXT"; payload: { projectId: string; targetProfileKey: string } }

export interface RelayPageState {
  supported: boolean
  platform?: string
  title?: string | null
  url?: string
  turns?: number
}
