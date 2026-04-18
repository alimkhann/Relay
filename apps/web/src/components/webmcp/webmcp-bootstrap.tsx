"use client"

import { useEffect } from "react"

type WebMcpToolResult = {
  content: Array<{ type: "text"; text: string }>
}

type WebMcpTool = {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, never>
  }
  execute: () => Promise<WebMcpToolResult>
}

declare global {
  interface Navigator {
    modelContext?: {
      provideContext?: (context: { tools: WebMcpTool[] }) => void | Promise<void>
    }
  }
}

const TOOLS: WebMcpTool[] = [
  {
    name: "open_relay_getting_started",
    description: "Open Relay's getting-started documentation.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      window.location.assign("/docs/getting-started")
      return { content: [{ type: "text", text: "Opened Relay getting-started documentation." }] }
    },
  },
  {
    name: "open_relay_mcp_docs",
    description: "Open Relay's MCP integration guide.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      window.location.assign("/docs/mcp")
      return { content: [{ type: "text", text: "Opened Relay MCP documentation." }] }
    },
  },
  {
    name: "open_relay_api_docs",
    description: "Open Relay's API reference.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      window.location.assign("/docs/api")
      return { content: [{ type: "text", text: "Opened Relay API documentation." }] }
    },
  },
]

export function WebMcpBootstrap() {
  useEffect(() => {
    const provideContext = navigator.modelContext?.provideContext
    if (!provideContext) {
      return
    }

    void provideContext({ tools: TOOLS })
  }, [])

  return null
}
