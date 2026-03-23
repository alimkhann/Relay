import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { z } from "zod"

import { isAuthRequiredError, resolveViewer, type Viewer } from "@/server/policies/viewer"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { RelayHttpMcpClient } from "./relay-http-mcp-client"

async function resolveViewerFromRequest(request: Request): Promise<Viewer> {
  const authHeader = request.headers.get("authorization")
    ?? (request.headers.get("token") ? `Bearer ${request.headers.get("token")}` : null)
  return resolveViewer(authHeader)
}

function createHttpMcpServer(viewer: Viewer) {
  const client = new RelayHttpMcpClient(viewer)
  const server = new McpServer({
    name: "relay",
    version: "0.2.0"
  })

  const projectId = viewer.projectId

  async function resolveProjectId(explicitId?: string): Promise<string> {
    if (explicitId) return explicitId
    if (projectId) return projectId
    throw new Error("Could not determine project. Provide a projectId argument.")
  }

  registerHttpTools(server, client, resolveProjectId)
  registerHttpPrompts(server)

  return server
}

function registerHttpTools(
  server: McpServer,
  client: RelayHttpMcpClient,
  resolveProjectId: (explicitId?: string) => Promise<string>
) {
  server.tool(
    "list_projects",
    "List all Relay projects you have access to.",
    {},
    async () => {
      const projects = await client.listProjects()
      return {
        content: [{ type: "text" as const, text: JSON.stringify(projects, null, 2) }]
      }
    }
  )

  server.tool(
    "get_brief",
    "Fetch a project context brief from Relay.",
    {
      projectId: z.string().optional().describe("Project ID"),
      kind: z.string().optional().describe("Brief kind: fresh_chat_bootstrap or quick_continuity"),
      targetProfileKey: z.string().optional().describe("Target profile key"),
      include: z.array(z.string()).optional().describe("Extra data to include"),
    },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const brief = await client.getBrief(pid, args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: brief }]
      }
    }
  )

  server.tool(
    "get_project_state",
    "Get full structured project state.",
    {
      projectId: z.string().optional().describe("Project ID"),
    },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const state = await client.getProjectState(pid)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(state, null, 2) }]
      }
    }
  )

  server.tool(
    "search_context",
    "Search memory items by keyword.",
    {
      projectId: z.string().optional().describe("Project ID"),
      query: z.string().describe("Search query"),
      types: z.array(z.string()).optional().describe("Filter by types"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      limit: z.number().optional().describe("Max results"),
    },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const results = await client.searchMemory(pid, args.query, {
        types: args.types,
        tags: args.tags,
        limit: args.limit,
      })
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }]
      }
    }
  )

  server.tool(
    "add_memory",
    "Add a memory item to the project.",
    {
      projectId: z.string().optional().describe("Project ID"),
      type: z.string().describe("Memory type: decision, constraint, task, note, artifact, requirement"),
      content: z.string().describe("Memory content"),
      title: z.string().optional().describe("Optional title"),
      tags: z.array(z.string()).optional().describe("Tags"),
    },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const item = await client.addMemory(pid, {
        type: args.type,
        content: args.content,
        title: args.title,
        tags: args.tags,
      })
      return {
        content: [{ type: "text" as const, text: JSON.stringify(item, null, 2) }]
      }
    }
  )

  server.tool(
    "save_context",
    "Save a structured session summary.",
    {
      projectId: z.string().optional().describe("Project ID"),
      summary: z.string().optional().describe("Session summary"),
      decisions: z.array(z.string()).optional().describe("Decisions made"),
      progress: z.string().optional().describe("Progress description"),
      nextSteps: z.array(z.string()).optional().describe("Next steps"),
      constraints: z.array(z.string()).optional().describe("Constraints"),
      notes: z.array(z.string()).optional().describe("Notes"),
    },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      await client.saveContext(pid, args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: "Context saved successfully." }]
      }
    }
  )

  server.tool(
    "manage_memory",
    "Update, delete, or archive memory items.",
    {
      action: z.string().describe("Action: update, delete, archive"),
      memoryId: z.string().describe("Memory item ID"),
      content: z.string().optional().describe("Updated content (for update)"),
      title: z.string().optional().describe("Updated title (for update)"),
      tags: z.array(z.string()).optional().describe("Updated tags (for update)"),
    },
    async (args) => {
      await client.manageMemory(args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: `Memory item ${args.action}d successfully.` }]
      }
    }
  )

  server.tool(
    "update_project",
    "Update a project's name or description.",
    {
      projectId: z.string().optional().describe("Project ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
    },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      await client.updateProject(pid, {
        name: args.name,
        description: args.description,
      })
      return {
        content: [{ type: "text" as const, text: "Project updated successfully." }]
      }
    }
  )

  server.tool(
    "recall_context",
    "Search memory and retrieve project state in one call. Use before making decisions to check for existing constraints and context.",
    {
      projectId: z.string().optional().describe("Project ID"),
      query: z.string().describe("What to search for in project memory"),
    },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const result = await client.recallContext(pid, args.query)
      return {
        content: [{ type: "text" as const, text: result }]
      }
    }
  )
}

const SESSION_GUIDELINES = `# Relay Session Guidelines

You have access to Relay, a project memory system that keeps context synchronized across coding sessions and AI tools.

## Recommended Workflow

### At Session Start
- Call \`get_brief\` to load the current project context, decisions, constraints, and recent progress.

### During the Session
- Before making architectural decisions, call \`recall_context\` to check for existing decisions or constraints.
- When the user makes a new decision or identifies a task, call \`add_memory\` to persist it immediately.
- Use \`search_context\` to check for duplicates before adding.

### At Session End
- Call \`save_context\` with a structured summary of what was accomplished, new decisions, and next steps.

## Memory Types
- **decision**: Architectural or implementation choices
- **constraint**: Hard limits or requirements
- **task**: Actionable next steps
- **note**: General observations or context
- **requirement**: Product or business requirements
- **artifact**: Code snippets, schemas, or reference material
`

function registerHttpPrompts(server: McpServer) {
  server.prompt(
    "relay_session_guidelines",
    "Guidelines for using Relay tools effectively during a coding session.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: SESSION_GUIDELINES },
        },
      ],
    })
  )
}

async function handleMcpRequest(request: Request) {
  await assertIpRateLimit(request, "mcp_stream_ip", 30)

  let viewer: Viewer
  try {
    viewer = await resolveViewerFromRequest(request)
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return new Response(JSON.stringify({ error: "unauthorized", message: "Valid MCP token required. Run npx @onrelay/wizard to get one." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    throw error
  }

  const server = createHttpMcpServer(viewer)

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  })

  await server.connect(transport)

  try {
    return await transport.handleRequest(request)
  } finally {
    await transport.close()
    await server.close()
  }
}

export async function POST(request: Request) {
  return handleMcpRequest(request)
}

export async function GET(request: Request) {
  return handleMcpRequest(request)
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request)
}
