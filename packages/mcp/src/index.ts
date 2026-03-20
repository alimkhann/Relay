import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { RelayMcpAnalytics } from "./analytics.js"
import { loadConfig } from "./config.js"
import { RelayClient } from "./client.js"
import { createServer } from "./server.js"

async function main() {
  const config = await loadConfig()
  const analytics = new RelayMcpAnalytics()
  await analytics.identify(config.apiBase, config.token)
  const client = new RelayClient(config, analytics)
  const server = createServer(client, config)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error("Relay MCP server running on stdio")
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
