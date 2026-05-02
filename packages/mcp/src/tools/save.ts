import { z } from "zod"
import type { RelayClient } from "../client.js"
import { saveContext } from "./save-context.js"
import { addMemory } from "./add-memory.js"
import { manageMemory } from "./manage-memory.js"
import { setProjectState } from "./set-project-state.js"
import { updateProject } from "./update-project.js"
import { archiveSession } from "./archive-session.js"
import { regenerateBrief } from "./regenerate-brief.js"
import { deleteBrief } from "./delete-brief.js"

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
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  action: actionEnum.describe("The write action to perform."),
  payload: z.record(z.string(), z.unknown()).describe("Action-specific payload. See individual tool docs for fields."),
})

export async function save(
  client: RelayClient,
  args: z.infer<typeof saveSchema>,
  projectId: string,
  recordMutation: (projectId: string, mutation: Record<string, unknown>) => Promise<void>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const p = args.payload as Record<string, unknown>

  switch (args.action) {
    case "save_session":
      return saveContext(client, { ...p, projectId, finalize: p.finalize !== false } as never, projectId)

    case "checkpoint":
      return saveContext(client, { ...p, projectId, finalize: false } as never, projectId)

    case "add_memory": {
      const result = await addMemory(
        client,
        { projectId, content: String(p.content ?? ""), type: String(p.type ?? "note") as "note" | "decision" | "constraint" | "requirement" | "task" | "artifact", title: p.title as string | undefined, tags: p.tags as string[] | undefined },
        projectId,
      )
      await recordMutation(projectId, {
        eventType: "memory_added",
        eventPayload: { type: p.type, title: p.title ?? null },
        decisions: p.type === "decision" ? [p.content] : undefined,
        constraints: p.type === "constraint" ? [p.content] : undefined,
        nextSteps: p.type === "task" ? [p.content] : undefined,
      }).catch(() => {})
      return result
    }

    case "manage_memory":
      return manageMemory(client, {
        memoryId: String(p.memoryId ?? ""),
        action: String(p.action ?? "update") as "update" | "delete" | "archive" | "unarchive",
        ...(p.updates ? { updates: p.updates as Record<string, unknown> } : {}),
      } as never)

    case "set_state": {
      const result = await setProjectState(client, { ...p, projectId } as never, projectId)
      await recordMutation(projectId, {
        eventType: "project_state_updated",
        eventPayload: { replaceLists: p.replaceLists ?? false },
      }).catch(() => {})
      return result
    }

    case "update_project": {
      const result = await updateProject(client, { ...p, projectId } as never, projectId)
      await recordMutation(projectId, {
        eventType: "project_updated",
        eventPayload: { name: p.name ?? null },
      }).catch(() => {})
      return result
    }

    case "archive_session":
      return archiveSession(client, { sessionId: String(p.sessionId ?? ""), archived: Boolean(p.archived ?? true), projectId } as never, projectId)

    case "regenerate_brief":
      return regenerateBrief(client, { projectId, ...p } as never, projectId)

    case "delete_brief":
      return deleteBrief(client, { briefId: String(p.briefId ?? ""), projectId } as never, projectId)

    default:
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown action: ${args.action}` }) }],
      }
  }
}
