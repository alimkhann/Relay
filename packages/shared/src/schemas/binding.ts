import { z } from "zod"

export const bindingInputSchema = z.object({
  projectId: z.string().min(1),
  bindingKind: z.enum(["tab", "domain", "manual"]),
  domain: z.string().nullable().optional(),
  tabId: z.string().nullable().optional(),
  platform: z.enum(["chatgpt", "perplexity", "claude", "codex"]).nullable().optional()
})

export const bindingResolveSchema = z.object({
  domain: z.string().nullable().optional(),
  tabId: z.string().nullable().optional(),
  platform: z.enum(["chatgpt", "perplexity", "claude", "codex"]).nullable().optional()
})
