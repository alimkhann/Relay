import { z } from "zod"
import type { RelayClient } from "../client.js"

export const saveContextSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  summary: z.string().describe("Summary of the coding session"),
  decisions: z.array(z.string()).optional().describe("Key decisions made during the session"),
  progress: z.string().optional().describe("What was accomplished"),
  nextSteps: z.array(z.string()).optional().describe("Planned next steps"),
  constraints: z.array(z.string()).optional().describe("Constraints or blockers discovered"),
  notes: z.array(z.string()).optional().describe("Additional notes or observations"),
  relevantTools: z.array(z.string()).optional().describe("Tools, frameworks, or surfaces relevant to the session"),
  touchedFiles: z.array(z.string()).optional().describe("Files materially touched during the session"),
  currentObjective: z.string().optional().describe("Current objective or focus for the project"),
  /** When true (default), the session is flushed (digest + reconcile + close) after saving. */
  finalize: z.boolean().optional().describe("When true, finalize the work session after saving. Default true."),
})

interface BatchCreateResponse {
  items: Array<{ id: string; type: string; title: string | null }>
}

function buildMcpMetadata(kind: "summary" | "progress" | "decision" | "constraint" | "task" | "note") {
  return {
    source: "mcp",
    authority: kind === "decision" || kind === "constraint" ? "work_session" : "validated_state",
    durability:
      kind === "decision" || kind === "constraint"
        ? "durable"
        : kind === "task"
          ? "working"
          : "durable",
    validationState: kind === "summary" || kind === "progress" ? "validated" : "inferred",
    workSessionFinalized: true,
  }
}

function formatSavedSummary(args: z.infer<typeof saveContextSchema>, finalized: boolean): string {
  const counts: string[] = []
  if (args.decisions?.length) counts.push(`${args.decisions.length} decision${args.decisions.length === 1 ? "" : "s"}`)
  if (args.constraints?.length) counts.push(`${args.constraints.length} constraint${args.constraints.length === 1 ? "" : "s"}`)
  if (args.nextSteps?.length) counts.push(`${args.nextSteps.length} next step${args.nextSteps.length === 1 ? "" : "s"}`)
  if (args.notes?.length) counts.push(`${args.notes.length} note${args.notes.length === 1 ? "" : "s"}`)
  const tail = counts.length ? ` (${counts.join(", ")})` : ""
  return finalized
    ? `Relay: session flushed through digest + reconcile pipeline${tail}.`
    : `Relay: session checkpoint saved${tail}. Will flush on next finalize or hook trigger.`
}

export async function saveContext(
  client: RelayClient,
  args: z.infer<typeof saveContextSchema>,
  resolvedProjectId: string,
) {
  const finalize = args.finalize !== false

  // Primary path: append structured state to the active work session, then
  // trigger the digest + reconcile + close pipeline. Identical flow to the
  // autonomous hook path (relay-flush) and the server-side opportunistic
  // sweep — same extractor, same reconciler, same memory_relations writes.
  try {
    await client.recordSessionMutation(resolvedProjectId, {
      eventType: "save_context",
      eventPayload: { savedVia: "relay_save_context", finalize },
      summary: args.summary,
      progress: args.progress ?? null,
      currentObjective: args.currentObjective ?? null,
      decisions: args.decisions,
      constraints: args.constraints,
      nextSteps: args.nextSteps,
      notes: args.notes,
      relevantTools: args.relevantTools,
      touchedFiles: args.touchedFiles,
    })

    if (finalize) {
      await client.flushWorkSession("explicit")
    }

    return {
      content: [
        {
          type: "text" as const,
          text: formatSavedSummary(args, finalize),
        },
      ],
    }
  } catch {
    // Work-session path failed (missing scope, stale server, etc.).
    // Fall through to legacy pass-through so saves never fail silently.
  }

  const capturedAt = new Date().toISOString()
  const items: Array<{
    type: string
    content: string
    title?: string
    metadata?: Record<string, unknown>
    sourceSurface: "mcp"
    capturedAt: string
  }> = []

  items.push({
    type: "note",
    content: args.summary,
    title: "IDE Session Summary",
    metadata: buildMcpMetadata("summary"),
    sourceSurface: "mcp",
    capturedAt,
  })

  if (args.progress) {
    items.push({
      type: "note",
      content: args.progress,
      title: "Session Progress",
      metadata: buildMcpMetadata("progress"),
      sourceSurface: "mcp",
      capturedAt,
    })
  }

  for (const decision of args.decisions ?? []) {
    items.push({
      type: "decision",
      content: decision,
      metadata: buildMcpMetadata("decision"),
      sourceSurface: "mcp",
      capturedAt,
    })
  }
  for (const constraint of args.constraints ?? []) {
    items.push({
      type: "constraint",
      content: constraint,
      metadata: buildMcpMetadata("constraint"),
      sourceSurface: "mcp",
      capturedAt,
    })
  }
  for (const step of args.nextSteps ?? []) {
    items.push({
      type: "task",
      content: step,
      metadata: buildMcpMetadata("task"),
      sourceSurface: "mcp",
      capturedAt,
    })
  }
  for (const note of args.notes ?? []) {
    items.push({
      type: "note",
      content: note,
      metadata: buildMcpMetadata("note"),
      sourceSurface: "mcp",
      capturedAt,
    })
  }

  const stateFallback = () =>
    client
      .post(`/api/projects/${resolvedProjectId}/mcp-state`, {
        recentProgress: args.progress ?? args.summary,
        currentObjective: args.currentObjective,
        decisions: args.decisions,
        constraints: args.constraints,
        openTasks: args.nextSteps,
        relevantTools: args.relevantTools,
        replaceLists: false,
      })
      .catch(() => {})

  try {
    const data = await client.post<BatchCreateResponse>(
      `/api/projects/${resolvedProjectId}/memory/batch`,
      { items },
    )
    await stateFallback()

    const created = data.items.map((item) => `${item.type}${item.title ? `: ${item.title}` : ""}`)
    return {
      content: [
        {
          type: "text" as const,
          text: `Saved ${created.length} context items to Relay (legacy path):\n${created.map((c) => `  - ${c}`).join("\n")}`,
        },
      ],
    }
  } catch {
    const created: string[] = []
    for (const item of items) {
      await client.post(`/api/projects/${resolvedProjectId}/memory`, { projectId: resolvedProjectId, ...item })
      created.push(`${item.type}${item.title ? `: ${item.title}` : ""}`)
    }
    await stateFallback()

    return {
      content: [
        {
          type: "text" as const,
          text: `Saved ${created.length} context items to Relay (legacy path):\n${created.map((c) => `  - ${c}`).join("\n")}`,
        },
      ],
    }
  }
}
