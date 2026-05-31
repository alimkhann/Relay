import { z } from "zod"
import type { RelayClient } from "../client.js"
import { saveContext, saveContextSchema } from "./save-context.js"
import { addMemory, addMemorySchema } from "./add-memory.js"
import { manageMemory, manageMemorySchema } from "./manage-memory.js"
import { setProjectState, setProjectStateSchema } from "./set-project-state.js"
import { updateProject, updateProjectSchema } from "./update-project.js"
import { archiveSession, archiveSessionSchema } from "./archive-session.js"
import { regenerateBrief, regenerateBriefSchema } from "./regenerate-brief.js"
import { deleteBrief, deleteBriefSchema } from "./delete-brief.js"

const actionEnum = z.enum([
  "save_session",
  "checkpoint",
  "add_memory",
  "manage_memory",
  "set_state",
  "update_project",
  "archive_session",
  "regenerate_brief",
  "delete_brief",
])

export const saveSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided. Pass the literal \"personal\" to target the user's personal memory project."),
  action: actionEnum.describe("The write action to perform."),
  payload: z.record(z.string(), z.unknown()).describe("Action-specific payload. See individual tool docs for fields."),
})

interface MutationInput {
  eventType: string
  eventPayload?: Record<string, unknown>
  summary?: string | null
  progress?: string | null
  currentObjective?: string | null
  decisions?: string[]
  constraints?: string[]
  nextSteps?: string[]
  notes?: string[]
  relevantTools?: string[]
  touchedFiles?: string[]
  reaffirmedFacts?: string[]
}

export async function save(
  client: RelayClient,
  args: z.infer<typeof saveSchema>,
  projectId: string,
  recordMutation: (projectId: string, mutation: MutationInput) => Promise<void>,
  recordEvent: (projectId: string, eventType: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const p: Record<string, unknown> = { ...(args.payload as Record<string, unknown>), projectId }

  switch (args.action) {
    case "save_session": {
      const parsed = saveContextSchema.parse({ ...p, finalize: p.finalize !== false })
      return saveContext(client, parsed, projectId)
    }

    case "checkpoint": {
      const parsed = saveContextSchema.parse({ ...p, finalize: false })
      return saveContext(client, parsed, projectId)
    }

    case "add_memory": {
      const parsed = addMemorySchema.parse(p)
      const result = await addMemory(client, parsed, projectId)
      await recordMutation(projectId, {
        eventType: "memory_added",
        eventPayload: { type: parsed.type, title: parsed.title ?? null },
        decisions: parsed.type === "decision" ? [parsed.content] : undefined,
        constraints: parsed.type === "constraint" ? [parsed.content] : undefined,
        nextSteps: parsed.type === "task" ? [parsed.content] : undefined,
        notes: parsed.type === "note" || parsed.type === "artifact" || parsed.type === "requirement" ? [parsed.content] : undefined,
      }).catch(() => {})
      return result
    }

    case "manage_memory": {
      const parsed = manageMemorySchema.parse(p)
      const result = await manageMemory(client, parsed)
      await recordEvent(projectId, "memory_managed", {
        action: parsed.action,
        memoryId: parsed.memoryId,
      }).catch(() => {})
      return result
    }

    case "set_state": {
      const parsed = setProjectStateSchema.parse(p)
      const result = await setProjectState(client, parsed, projectId)
      await recordMutation(projectId, {
        eventType: "project_state_updated",
        eventPayload: { replaceLists: parsed.replaceLists ?? false },
        summary: parsed.projectOverview,
        currentObjective: parsed.currentObjective,
        progress: parsed.recentProgress,
        decisions: parsed.decisions,
        constraints: parsed.constraints,
        nextSteps: parsed.openTasks,
        relevantTools: parsed.relevantTools,
      }).catch(() => {})
      return result
    }

    case "update_project": {
      const parsed = updateProjectSchema.parse(p)
      const result = await updateProject(client, parsed, projectId)
      await recordMutation(projectId, {
        eventType: "project_updated",
        eventPayload: {
          name: parsed.name ?? null,
          descriptionChanged: typeof parsed.description === "string",
        },
        summary: parsed.description ?? undefined,
      }).catch(() => {})
      return result
    }

    case "archive_session": {
      const parsed = archiveSessionSchema.parse(p)
      return archiveSession(client, parsed, projectId)
    }

    case "regenerate_brief": {
      const parsed = regenerateBriefSchema.parse(p)
      return regenerateBrief(client, parsed, projectId)
    }

    case "delete_brief": {
      const parsed = deleteBriefSchema.parse(p)
      return deleteBrief(client, parsed, projectId)
    }

    default:
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown action: ${args.action}` }) }],
      }
  }
}
