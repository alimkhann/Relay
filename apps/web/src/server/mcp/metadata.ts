import { APP_ORIGIN } from "@/lib/site-config"

export const RELAY_MCP_SERVER_NAME = "relay"
export const RELAY_MCP_SERVER_VERSION = "0.2.1"
export const RELAY_MCP_TRANSPORT_ENDPOINT = `${APP_ORIGIN}/api/mcp/stream`
export const RELAY_MCP_DOCUMENTATION_URL = `${APP_ORIGIN}/docs/mcp`

export const RELAY_MCP_TOOL_NAMES = [
  "project.list",
  "project.set_current",
  "project.get_brief",
  "project.get_state",
  "memory.search",
  "memory.add",
  "context.save",
  "context.checkpoint",
  "memory.manage",
  "project.set_state",
  "project.update",
  "memory.recall",
] as const

export const RELAY_MCP_PROMPT_NAMES = [
  "relay_session_guidelines",
] as const

export const RELAY_MCP_RESOURCE_URIS = [
  "relay://session-guidelines",
] as const
