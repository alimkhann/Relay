import { RELAY_MCP_DOCUMENTATION_URL, RELAY_MCP_PROMPT_NAMES, RELAY_MCP_RESOURCE_URIS, RELAY_MCP_SERVER_NAME, RELAY_MCP_SERVER_VERSION, RELAY_MCP_TOOL_NAMES, RELAY_MCP_TRANSPORT_ENDPOINT } from "@/server/mcp/metadata"

const BODY = {
  serverInfo: {
    name: RELAY_MCP_SERVER_NAME,
    version: RELAY_MCP_SERVER_VERSION,
  },
  transport: {
    type: "streamable-http",
    endpoint: RELAY_MCP_TRANSPORT_ENDPOINT,
  },
  documentationUrl: RELAY_MCP_DOCUMENTATION_URL,
  capabilities: {
    tools: {
      enabled: true,
      names: RELAY_MCP_TOOL_NAMES,
    },
    prompts: {
      enabled: true,
      names: RELAY_MCP_PROMPT_NAMES,
    },
    resources: {
      enabled: true,
      uris: RELAY_MCP_RESOURCE_URIS,
    },
  },
}

export async function GET() {
  return Response.json(BODY, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300",
    },
  })
}
