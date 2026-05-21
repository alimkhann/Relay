import { z } from "zod"
import type { RelayClient } from "../client.js"

export const manageMemorySchema = z.object({
  action: z
    .enum([
      "update",
      "delete",
      "archive",
      "restore",
      "forget",
      "mark_obsolete",
      "reaffirm",
    ])
    .describe(
      "Action to perform on the memory item(s). " +
        "archive=move to archived, restore=move back to active, " +
        "forget=tombstone (requires confirm=true), " +
        "mark_obsolete=close validity + cooling, " +
        "reaffirm=reset decay clock.",
    ),
  memoryId: z
    .union([z.string(), z.array(z.string())])
    .describe("ID or array of IDs of memory items to manage"),
  content: z.string().optional().describe("Updated content (for update action)"),
  title: z.string().optional().describe("Updated title (for update action)"),
  type: z
    .enum(["note", "decision", "constraint", "requirement", "task", "artifact"])
    .optional()
    .describe("Updated type (for update action)"),
  pinned: z.boolean().optional().describe("Whether to pin/unpin (for update action)"),
  tags: z.array(z.string()).optional().describe("Updated tags (for update action)"),
  confirm: z
    .boolean()
    .optional()
    .describe("Confirmation flag required for the 'forget' action (destructive)."),
})

interface UpdateMemoryResponse {
  item: {
    id: string
    type: string
    title: string | null
    content: string
    pinned: boolean
    updatedAt: string
  }
}

async function patchMany(
  client: RelayClient,
  ids: string[],
  body: Record<string, unknown>,
  verb: string,
): Promise<{ ok: string[]; errors: string[] }> {
  const ok: string[] = []
  const errors: string[] = []
  for (const id of ids) {
    try {
      await client.patch<UpdateMemoryResponse>(`/api/memory/${id}`, body)
      ok.push(id)
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : "unknown error"}`)
    }
  }
  return { ok, errors }
}

function summarize(verb: string, ok: string[], errors: string[]) {
  const lines: string[] = []
  if (ok.length > 0) lines.push(`${verb} ${ok.length} memory item(s): ${ok.join(", ")}`)
  if (errors.length > 0)
    lines.push(`Failed to ${verb.toLowerCase()} ${errors.length} item(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`)
  return { content: [{ type: "text" as const, text: lines.join("\n") }] }
}

export async function manageMemory(
  client: RelayClient,
  args: z.infer<typeof manageMemorySchema>,
) {
  const ids = Array.isArray(args.memoryId) ? args.memoryId : [args.memoryId]

  if (args.action === "delete") {
    const results: string[] = []
    const errors: string[] = []

    for (const id of ids) {
      try {
        await client.delete(`/api/memory/${id}`)
        results.push(id)
      } catch (err) {
        errors.push(`${id}: ${err instanceof Error ? err.message : "unknown error"}`)
      }
    }

    return summarize("Deleted", results, errors)
  }

  if (args.action === "archive") {
    const { ok, errors } = await patchMany(
      client,
      ids,
      { lifecycleState: "archived", isArchived: true },
      "Archived",
    )
    return summarize("Archived", ok, errors)
  }

  if (args.action === "restore") {
    const { ok, errors } = await patchMany(
      client,
      ids,
      { lifecycleState: "active", isArchived: false },
      "Restored",
    )
    return summarize("Restored", ok, errors)
  }

  if (args.action === "forget") {
    if (!args.confirm) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "The 'forget' action is destructive (nulls content). Re-call with confirm:true to proceed.",
          },
        ],
      }
    }
    const { ok, errors } = await patchMany(
      client,
      ids,
      { lifecycleState: "forgotten", confirm: true },
      "Forgot",
    )
    return summarize("Forgot", ok, errors)
  }

  if (args.action === "mark_obsolete") {
    const { ok, errors } = await patchMany(
      client,
      ids,
      { lifecycleState: "cooling", validUntil: new Date().toISOString() },
      "Marked obsolete",
    )
    return summarize("Marked obsolete", ok, errors)
  }

  if (args.action === "reaffirm") {
    const { ok, errors } = await patchMany(
      client,
      ids,
      { lastReaffirmedAt: new Date().toISOString() },
      "Reaffirmed",
    )
    return summarize("Reaffirmed", ok, errors)
  }

  // Update action
  if (ids.length !== 1) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Update action requires exactly one memory ID.",
        },
      ],
    }
  }

  const updates: Record<string, unknown> = {}
  if (args.content !== undefined) updates.content = args.content
  if (args.title !== undefined) updates.title = args.title
  if (args.type !== undefined) updates.type = args.type
  if (args.pinned !== undefined) updates.pinned = args.pinned
  if (args.tags !== undefined) updates.tags = args.tags

  const data = await client.patch<UpdateMemoryResponse>(`/api/memory/${ids[0]}`, updates)

  return {
    content: [
      {
        type: "text" as const,
        text: `Memory item updated: ${data.item.type}${data.item.title ? ` — "${data.item.title}"` : ""} (id: ${data.item.id})`,
      },
    ],
  }
}
