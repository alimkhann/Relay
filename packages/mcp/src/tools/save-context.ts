import { z } from "zod"
import type { RelayClient } from "../client.js"

export const saveContextSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  summary: z.string().describe("Summary of the coding session"),
  decisions: z.array(z.string()).optional().describe("Key decisions made during the session"),
  progress: z.string().optional().describe("What was accomplished"),
  nextSteps: z.array(z.string()).optional().describe("Planned next steps"),
  constraints: z.array(z.string()).optional().describe("Constraints or blockers discovered"),
  notes: z.array(z.string()).optional().describe("Additional notes or observations")
})

interface BatchCreateResponse {
  items: Array<{ id: string; type: string; title: string | null }>
}

export async function saveContext(
  client: RelayClient,
  args: z.infer<typeof saveContextSchema>,
  resolvedProjectId: string
) {
  const capturedAt = new Date().toISOString()
  const items: Array<{
    type: string
    content: string
    title?: string
    metadata?: Record<string, unknown>
    sourceSurface: "mcp"
    capturedAt: string
  }> = []

  // Session summary
  items.push({
    type: "note",
    content: args.summary,
    title: "IDE Session Summary",
    metadata: { source: "mcp" },
    sourceSurface: "mcp",
    capturedAt
  })

  // Progress
  if (args.progress) {
    items.push({
      type: "note",
      content: args.progress,
      title: "Session Progress",
      metadata: { source: "mcp" },
      sourceSurface: "mcp",
      capturedAt
    })
  }

  // Decisions
  if (args.decisions) {
    for (const decision of args.decisions) {
      items.push({
        type: "decision",
        content: decision,
        metadata: { source: "mcp" },
        sourceSurface: "mcp",
        capturedAt
      })
    }
  }

  // Constraints
  if (args.constraints) {
    for (const constraint of args.constraints) {
      items.push({
        type: "constraint",
        content: constraint,
        metadata: { source: "mcp" },
        sourceSurface: "mcp",
        capturedAt
      })
    }
  }

  // Next steps as tasks
  if (args.nextSteps) {
    for (const step of args.nextSteps) {
      items.push({
        type: "task",
        content: step,
        metadata: { source: "mcp" },
        sourceSurface: "mcp",
        capturedAt
      })
    }
  }

  // Notes
  if (args.notes) {
    for (const note of args.notes) {
      items.push({
        type: "note",
        content: note,
        metadata: { source: "mcp" },
        sourceSurface: "mcp",
        capturedAt
      })
    }
  }

  try {
    const data = await client.post<BatchCreateResponse>(
      `/api/projects/${resolvedProjectId}/memory/batch`,
      { items }
    )

    const created = data.items.map((item) => `${item.type}${item.title ? `: ${item.title}` : ""}`)
    return {
      content: [
        {
          type: "text" as const,
          text: `Saved ${created.length} context items to Relay:\n${created.map((c) => `  - ${c}`).join("\n")}`
        }
      ]
    }
  } catch {
    // Fall back to sequential creation if batch endpoint not available
    const created: string[] = []

    for (const item of items) {
      await client.post(
        `/api/projects/${resolvedProjectId}/memory`,
        { projectId: resolvedProjectId, ...item }
      )
      created.push(`${item.type}${item.title ? `: ${item.title}` : ""}`)
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Saved ${created.length} context items to Relay:\n${created.map((c) => `  - ${c}`).join("\n")}`
        }
      ]
    }
  }
}
