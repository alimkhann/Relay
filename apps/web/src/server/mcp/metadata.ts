import { APP_ORIGIN } from "@/lib/site-config"

export const RELAY_MCP_SERVER_NAME = "relay"
export const RELAY_MCP_SERVER_VERSION = "0.5.0"
export const RELAY_MCP_TRANSPORT_ENDPOINT = `${APP_ORIGIN}/api/mcp/stream`
export const RELAY_MCP_DOCUMENTATION_URL = `${APP_ORIGIN}/docs/mcp`

export const RELAY_MCP_TOOL_NAMES = [
  "list_projects",
  "set_current_project",
  "get_brief",
  "recall",
  "sources",
  "save",
] as const

export const RELAY_MCP_PROMPT_NAMES = [
  "relay_session_guidelines",
] as const

export const RELAY_MCP_RESOURCE_URIS = [
  "relay://session-guidelines",
] as const
