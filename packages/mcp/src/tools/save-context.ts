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

interface CreateMemoryResponse {
  item: { id: string; type: string }
}

export async function saveContext(
  client: RelayClient,
  args: z.infer<typeof saveContextSchema>,
  resolvedProjectId: string
) {
  const created: string[] = []

  const createItem = async (type: string, content: string, title?: string) => {
    const data = await client.post<CreateMemoryResponse>(
      `/api/projects/${resolvedProjectId}/memory`,
      {
        projectId: resolvedProjectId,
        type,
        content,
        title: title ?? null,
        metadata: { source: "mcp" }
      }
    )
    created.push(`${data.item.type}: ${title ?? content.slice(0, 60)}`)
  }

  // Session summary
  await createItem("note", args.summary, "IDE Session Summary")

  // Progress
  if (args.progress) {
    await createItem("note", args.progress, "Session Progress")
  }

  // Decisions
  if (args.decisions) {
    for (const decision of args.decisions) {
      await createItem("decision", decision)
    }
  }

  // Constraints
  if (args.constraints) {
    for (const constraint of args.constraints) {
      await createItem("constraint", constraint)
    }
  }

  // Next steps as tasks
  if (args.nextSteps) {
    for (const step of args.nextSteps) {
      await createItem("task", step)
    }
  }

  // Notes
  if (args.notes) {
    for (const note of args.notes) {
      await createItem("note", note)
    }
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
