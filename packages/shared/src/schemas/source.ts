import { z } from "zod"

export const sourceKindSchema = z.enum(["uploaded_file", "repo_file", "external_docs", "package_docs"])
export const sourceStatusSchema = z.enum(["pending_upload", "processing", "ready", "failed", "archived", "stale"])
export const sourceVersionStatusSchema = z.enum(["pending_upload", "processing", "ready", "failed"])
export const sourceFactCandidateStatusSchema = z.enum(["pending", "promoted", "rejected"])
export const externalSourceTypeSchema = z.enum(["website", "llms_txt", "pdf", "arxiv", "openapi", "package_docs"])
export const sourceMemoryTypeSchema = z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"])

export const supportedSourceMimeTypes = [
  "text/markdown",
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const

export const createSourceUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(supportedSourceMimeTypes),
  byteSize: z.number().int().positive(),
  kind: sourceKindSchema.default("uploaded_file"),
})

// Cheap synchronous structural pre-filter for UX only. The authoritative
// SSRF guard (DNS resolution + private-IP rejection) lives server-side in
// apps/web/src/server/lib/safe-url.ts; this just rejects the obvious cases
// before a request is made.
const privateHostPatterns = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
  /^::1?$/i,
  /^::ffff:/i, // IPv4-mapped IPv6
  /^f[cd]/i, // unique local fc00::/7
  /^fe[89ab]/i, // link-local fe80::/10
  /^ff/i, // multicast
]

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    if (url.username || url.password) return false
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
    return !privateHostPatterns.some((pattern) => pattern.test(host))
  } catch {
    return false
  }
}

export const createExternalSourceSchema = z.object({
  url: z.string().trim().url().refine(isPublicHttpUrl, "External sources require a public https URL."),
  displayName: z.string().trim().min(1).max(255).optional(),
  sourceType: externalSourceTypeSchema.optional(),
  provider: z.enum(["relay", "context7", "nia"]).default("relay"),
  kind: sourceKindSchema.default("external_docs"),
  refreshPolicy: z.enum(["manual", "daily", "weekly"]).default("manual"),
}).refine((value) => value.kind === "external_docs" || value.kind === "package_docs", {
  message: "External source kind must be external_docs or package_docs.",
  path: ["kind"],
})

export const searchProjectSourcesSchema = z.object({
  query: z.string().trim().min(1).max(500),
  sourceId: z.string().uuid().optional(),
  kinds: z.array(sourceKindSchema).max(4).optional(),
  limit: z.number().int().positive().max(50).default(10),
})

export const promoteSourceCitationSchema = z.object({
  chunkId: z.string().uuid(),
  type: sourceMemoryTypeSchema.default("note"),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4_000),
})

export const sourcesToolActionSchema = z.enum(["list", "discover", "index", "status", "search", "read", "refresh", "promote"])

export const sourcesToolShape = {
  action: sourcesToolActionSchema,
  projectId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  chunkId: z.string().uuid().optional(),
  url: z.string().trim().url().optional(),
  query: z.string().trim().min(1).max(500).optional(),
  sourceType: externalSourceTypeSchema.optional(),
  provider: z.enum(["relay", "context7", "nia"]).optional(),
  displayName: z.string().trim().min(1).max(255).optional(),
  limit: z.number().int().positive().max(50).optional(),
  type: sourceMemoryTypeSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4_000).optional(),
}

export const sourcesToolSchema = z.object(sourcesToolShape).superRefine((value, ctx) => {
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

export const updateSourceSchema = z.object({
  displayName: z.string().trim().min(1).max(255).optional(),
  status: sourceStatusSchema.optional(),
})

export const sourceCandidateReviewSchema = z.object({
  action: z.enum(["promote", "reject"]),
})

export type CreateSourceUploadInput = z.infer<typeof createSourceUploadSchema>
export type CreateExternalSourceInput = z.infer<typeof createExternalSourceSchema>
export type SearchProjectSourcesInput = z.infer<typeof searchProjectSourcesSchema>
export type PromoteSourceCitationInput = z.infer<typeof promoteSourceCitationSchema>
export type SourcesToolInput = z.infer<typeof sourcesToolSchema>
