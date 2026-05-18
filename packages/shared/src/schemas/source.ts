import { z } from "zod"

export const sourceLifecycleActions = [
  "list",
  "resolve",
  "index",
  "status",
  "read",
  "search",
  "context_pack",
  "explore",
  "grep",
  "refresh",
  "promote",
  "import",
  "delete",
  "purge",
] as const

export const sourceKindSchema = z.enum(["uploaded_file", "repo_file", "external_docs", "package_docs"])
export const sourceStatusSchema = z.enum(["pending_upload", "processing", "ready", "failed", "archived", "stale"])
export const sourceVersionStatusSchema = z.enum(["pending_upload", "processing", "ready", "failed"])
export const sourceFactCandidateStatusSchema = z.enum(["pending", "promoted", "rejected"])
export const externalSourceTypeSchema = z.enum(["website", "llms_txt", "pdf", "arxiv", "openapi", "package_docs", "github_repo"])
export const sourceMemoryTypeSchema = z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"])
export const sourceImportProviderSchema = z.enum(["context7", "nia", "external"])
export const sourcePackageRegistrySchema = z.enum(["npm", "py_pi", "crates_io", "go", "ruby_gems"])

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
  kind: sourceKindSchema.default("external_docs"),
  refreshPolicy: z.enum(["manual", "daily", "weekly"]).default("manual"),
}).strict().refine((value) => value.kind === "external_docs" || value.kind === "package_docs", {
  message: "External source kind must be external_docs or package_docs.",
  path: ["kind"],
})

export const searchProjectSourcesSchema = z.object({
  query: z.string().trim().min(1).max(500),
  sourceId: z.string().uuid().optional(),
  kinds: z.array(sourceKindSchema).max(4).optional(),
  limit: z.number().int().positive().max(50).default(10),
}).strict()

export const resolveProjectSourcesSchema = z.object({
  query: z.string().trim().min(1).max(500),
  url: z.string().trim().url().refine(isPublicHttpUrl, "Resolver URLs require a public https URL.").optional(),
  manifestFileName: z.string().trim().min(1).max(255).optional(),
  manifestContent: z.string().trim().min(1).max(200_000).optional(),
  registry: sourcePackageRegistrySchema.optional(),
  limit: z.number().int().positive().max(20).default(8),
}).strict()

export const grepProjectSourcesSchema = z.object({
  query: z.string().trim().min(1).max(500),
  sourceId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(50).default(20),
}).strict()

export const exploreProjectSourcesSchema = z.object({
  sourceId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(200).default(100),
}).strict()

export const contextPackProjectSourcesSchema = z.object({
  query: z.string().trim().min(1).max(500),
  sourceId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(25).default(10),
  tokenBudget: z.number().int().positive().max(20_000).default(6_000),
}).strict()

export const promoteSourceCitationSchema = z.object({
  chunkId: z.string().uuid(),
  type: sourceMemoryTypeSchema.default("note"),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4_000),
}).strict()

export const importSourceCitationsSchema = z.object({
  provider: sourceImportProviderSchema,
  providerSourceId: z.string().trim().min(1).max(500).optional(),
  displayName: z.string().trim().min(1).max(255).optional(),
  citations: z.array(z.object({
    title: z.string().trim().min(1).max(255),
    url: z.string().trim().url().refine(isPublicHttpUrl, "Imported citations require public https URLs."),
    content: z.string().trim().min(1).max(8_000),
    locator: z.record(z.string(), z.unknown()).optional(),
  }).strict()).min(1).max(20),
}).strict()

export const sourcesToolActionSchema = z.enum(sourceLifecycleActions)

export const sourcesToolShape = {
  action: sourcesToolActionSchema,
  projectId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  chunkId: z.string().uuid().optional(),
  url: z.string().trim().url().optional(),
  query: z.string().trim().min(1).max(500).optional(),
  sourceType: externalSourceTypeSchema.optional(),
  refreshPolicy: z.enum(["manual", "daily", "weekly"]).optional(),
  registry: sourcePackageRegistrySchema.optional(),
  manifestFileName: z.string().trim().min(1).max(255).optional(),
  manifestContent: z.string().trim().min(1).max(200_000).optional(),
  tokenBudget: z.number().int().positive().max(20_000).optional(),
  importProvider: sourceImportProviderSchema.optional(),
  providerSourceId: z.string().trim().min(1).max(500).optional(),
  citations: importSourceCitationsSchema.shape.citations.optional(),
  displayName: z.string().trim().min(1).max(255).optional(),
  limit: z.number().int().positive().max(50).optional(),
  type: sourceMemoryTypeSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4_000).optional(),
}

export const sourcesToolSchema = z.object(sourcesToolShape).superRefine((value, ctx) => {
  if (["resolve", "search", "context_pack", "grep"].includes(value.action) && !value.query) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "query is required for this source action.", path: ["query"] })
  }
  if (value.action === "index" && !value.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "url is required for index.", path: ["url"] })
  }
  if (["status", "read", "refresh", "delete", "purge"].includes(value.action) && !value.sourceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for this source action.", path: ["sourceId"] })
  }
  if (value.action === "import") {
    if (!value.importProvider) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "importProvider is required for import.", path: ["importProvider"] })
    if (!value.citations || value.citations.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "citations are required for import.", path: ["citations"] })
  }
  if (value.action === "promote") {
    if (!value.sourceId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for promote.", path: ["sourceId"] })
    if (!value.chunkId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "chunkId is required for promote.", path: ["chunkId"] })
    if (!value.content) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "content is required for promote.", path: ["content"] })
  }
}).strict()

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
export type ResolveProjectSourcesInput = z.infer<typeof resolveProjectSourcesSchema>
export type GrepProjectSourcesInput = z.infer<typeof grepProjectSourcesSchema>
export type ExploreProjectSourcesInput = z.infer<typeof exploreProjectSourcesSchema>
export type ContextPackProjectSourcesInput = z.infer<typeof contextPackProjectSourcesSchema>
export type PromoteSourceCitationInput = z.infer<typeof promoteSourceCitationSchema>
export type ImportSourceCitationsInput = z.infer<typeof importSourceCitationsSchema>
export type SourcesToolInput = z.infer<typeof sourcesToolSchema>
