import { APP_ORIGIN } from "@/lib/site-config"

export const RELAY_MCP_SERVER_NAME = "relay"
export const RELAY_MCP_SERVER_VERSION = "0.4.1"
export const RELAY_MCP_TRANSPORT_ENDPOINT = `${APP_ORIGIN}/api/mcp/stream`
export const RELAY_MCP_DOCUMENTATION_URL = `${APP_ORIGIN}/docs/mcp`

export const RELAY_MCP_TOOL_NAMES = [
  "list_projects",
  "set_current_project",
  "get_brief",
  "get_project_state",
  "list_memory",
  "get_memory",
  "search_context",
  "list_sessions",
  "archive_session",
  "list_briefs",
  "regenerate_brief",
  "delete_brief",
  "trace_context_sources",
  "list_recent_activity",
  "add_memory",
  "save_context",
  "checkpoint_context",
  "manage_memory",
  "set_project_state",
  "update_project",
  "recall_context",
  "sources",
] as const

export const RELAY_MCP_PROMPT_NAMES = [
  "relay_session_guidelines",
] as const

export const RELAY_MCP_RESOURCE_URIS = [
  "relay://session-guidelines",
] as const
