import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { RelayMcpAnalytics } from "./analytics.js"
import { loadConfig } from "./config.js"
import { RelayClient } from "./client.js"
import { createServer } from "./server.js"

const analytics = new RelayMcpAnalytics()

async function main() {
  const config = await loadConfig()
  await analytics.identify(config.apiBase, config.token)
  const client = new RelayClient(config, analytics)
  const server = createServer(client, config)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  analytics.capture("mcp_server_started", {
    success: true,
    project_id: config.projectId ?? null,
  })

  console.error("Relay MCP server running on stdio")
}

main().catch(async (error) => {
  analytics.captureException(error, {
    project_id: null,
    success: false,
  })
  await analytics.shutdown()
  console.error("Fatal error:", error)
  process.exit(1)
})
