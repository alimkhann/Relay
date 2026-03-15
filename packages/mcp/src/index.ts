import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadConfig } from "./config.js"
import { RelayClient } from "./client.js"
import { createServer } from "./server.js"

async function main() {
  const config = await loadConfig()
  const client = new RelayClient(config)
  const server = createServer(client, config)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error("Relay MCP server running on stdio")
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
