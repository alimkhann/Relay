import { z } from "zod"
import type { RelayClient } from "../client.js"

const sourceLifecycleActions = ["list", "index", "status", "read", "search", "refresh", "promote", "delete", "purge"] as const

const sourcesToolShape = {
  action: z.enum(sourceLifecycleActions),
  projectId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  chunkId: z.string().uuid().optional(),
  url: z.string().trim().url().optional(),
  query: z.string().trim().min(1).max(500).optional(),
  sourceType: z.enum(["website", "llms_txt", "pdf", "arxiv", "openapi", "package_docs"]).optional(),
  refreshPolicy: z.enum(["manual", "daily", "weekly"]).optional(),
  displayName: z.string().trim().min(1).max(255).optional(),
  limit: z.number().int().positive().max(50).optional(),
  type: z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4_000).optional(),
}

const sourcesToolSchema = z.object(sourcesToolShape).superRefine((value, ctx) => {
  if (value.action === "search" && !value.query) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "query is required for this source action.", path: ["query"] })
  }
  if (value.action === "index" && !value.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "url is required for index.", path: ["url"] })
  }
  if (["status", "read", "refresh", "delete", "purge"].includes(value.action) && !value.sourceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for this source action.", path: ["sourceId"] })
  }
  if (value.action === "promote") {
    if (!value.sourceId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for promote.", path: ["sourceId"] })
    if (!value.chunkId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "chunkId is required for promote.", path: ["chunkId"] })
    if (!value.content) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "content is required for promote.", path: ["content"] })
  }
}).strict()

type SourcesArgs = z.input<typeof sourcesToolSchema>

function toolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : { result: payload },
  }
}

export const sourcesSchema = { shape: sourcesToolShape }

export async function sources(client: RelayClient, rawArgs: SourcesArgs, projectId: string) {
  const args = sourcesToolSchema.parse(rawArgs)
  if (args.action === "list") {
    return toolResult(await client.get(`/api/projects/${projectId}/sources`))
  }
  if (args.action === "index") {
    return toolResult(await client.post(`/api/projects/${projectId}/sources/external`, {
      url: args.url,
      displayName: args.displayName,
      sourceType: args.sourceType,
      refreshPolicy: args.refreshPolicy,
    }))
  }
  if (args.action === "search") {
    return toolResult(await client.post(`/api/projects/${projectId}/sources/search`, {
      query: args.query,
      sourceId: args.sourceId,
      limit: args.limit,
    }))
  }
  if (args.action === "status" || args.action === "read") {
    const params = new URLSearchParams()
    if (args.action === "read" && args.chunkId) params.set("chunkId", args.chunkId)
    if (args.action === "read" && args.limit) params.set("limit", String(args.limit))
    const suffix = params.size > 0 ? `?${params.toString()}` : ""
    return toolResult(await client.get(`/api/projects/${projectId}/sources/${args.sourceId}${suffix}`))
  }
  if (args.action === "refresh") {
    return toolResult(await client.post(`/api/projects/${projectId}/sources/${args.sourceId}/reprocess`, args))
  }
  if (args.action === "promote") {
    return toolResult(await client.post(`/api/projects/${projectId}/sources/${args.sourceId}/promote`, {
      chunkId: args.chunkId,
      type: args.type,
      title: args.title,
      content: args.content,
    }))
  }
  if (args.action === "delete") {
    await client.delete(`/api/projects/${projectId}/sources/${args.sourceId}`)
    return toolResult({ ok: true, sourceId: args.sourceId, archived: true })
  }
  if (args.action === "purge") {
    await client.delete(`/api/projects/${projectId}/sources/${args.sourceId}?purge=1`)
    return toolResult({ ok: true, sourceId: args.sourceId, purged: true })
  }
  return toolResult({ ok: false })
}
