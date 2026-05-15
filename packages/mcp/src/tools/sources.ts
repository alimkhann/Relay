import { z } from "zod"
import type { RelayClient } from "../client.js"

const sourcesToolShape = {
  action: z.enum(["list", "discover", "index", "status", "search", "read", "refresh", "promote"]),
  projectId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  chunkId: z.string().uuid().optional(),
  url: z.string().trim().url().optional(),
  query: z.string().trim().min(1).max(500).optional(),
  sourceType: z.enum(["website", "llms_txt", "pdf", "arxiv", "openapi", "package_docs"]).optional(),
  provider: z.enum(["relay", "context7", "nia"]).optional(),
  displayName: z.string().trim().min(1).max(255).optional(),
  mode: z.enum(["hybrid", "keyword", "semantic"]).optional(),
  limit: z.number().int().positive().max(50).optional(),
  type: z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4_000).optional(),
}

const sourcesToolSchema = z.object(sourcesToolShape).superRefine((value, ctx) => {
  if (["search", "discover"].includes(value.action) && !value.query) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "query is required for this source action.", path: ["query"] })
  }
  if (value.action === "index" && !value.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "url is required for index.", path: ["url"] })
  }
  if (["status", "read", "refresh"].includes(value.action) && !value.sourceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for this source action.", path: ["sourceId"] })
  }
  if (value.action === "promote") {
    if (!value.sourceId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for promote.", path: ["sourceId"] })
    if (!value.chunkId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "chunkId is required for promote.", path: ["chunkId"] })
    if (!value.content) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "content is required for promote.", path: ["content"] })
  }
})

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
    return toolResult(await client.post(`/api/projects/${projectId}/sources/external`, args))
  }
  if (args.action === "search") {
    return toolResult(await client.post(`/api/projects/${projectId}/sources/search`, args))
  }
  if (args.action === "status" || args.action === "read") {
    return toolResult(await client.get(`/api/projects/${projectId}/sources/${args.sourceId}`))
  }
  if (args.action === "refresh") {
    return toolResult(await client.post(`/api/projects/${projectId}/sources/${args.sourceId}/reprocess`, args))
  }
  if (args.action === "promote") {
    return toolResult(await client.post(`/api/projects/${projectId}/sources/${args.sourceId}/promote`, args))
  }
  if (args.action === "discover") {
    return toolResult({
      candidates: [],
      note: "Relay-native v1 indexes public docs/research URLs directly. Provide a public https URL with action:index to add it.",
      query: args.query,
    })
  }
  return toolResult({ ok: false })
}
