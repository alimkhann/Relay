import { z } from "zod"

export const sourceKindSchema = z.enum(["uploaded_file", "repo_file", "external_docs", "package_docs"])
export const sourceStatusSchema = z.enum(["pending_upload", "processing", "ready", "failed", "archived", "stale"])
export const sourceVersionStatusSchema = z.enum(["pending_upload", "processing", "ready", "failed"])
export const sourceFactCandidateStatusSchema = z.enum(["pending", "promoted", "rejected"])

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

export const updateSourceSchema = z.object({
  displayName: z.string().trim().min(1).max(255).optional(),
  status: sourceStatusSchema.optional(),
})

export const sourceCandidateReviewSchema = z.object({
  action: z.enum(["promote", "reject"]),
})

export type CreateSourceUploadInput = z.infer<typeof createSourceUploadSchema>
