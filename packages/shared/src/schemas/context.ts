import { z } from "zod"

export const targetProfileKeySchema = z.enum([
  "chatgpt_planning",
  "perplexity_research",
  "claude_code_build",
  "codex_implementation",
  "gemini_exploration",
  "grok_conversation",
  "deepseek_reasoning"
])

export const composeContextSchema = z.object({
  targetProfileKey: targetProfileKeySchema,
  since: z.string().datetime().optional()
})

export const bootstrapRequestSchema = z.object({
  targetProfileKey: targetProfileKeySchema,
  kind: z.enum(["quick_continuity", "fresh_chat_bootstrap"]).default("fresh_chat_bootstrap"),
  deep: z.boolean().optional(),
  since: z.string().datetime().optional(),
  syncSurface: z.enum(["mcp", "cli", "chatgpt", "claude", "codex", "opencode", "gemini", "cursor", "warp", "windsurf", "antigravity", "grok", "perplexity", "deepseek"]).optional()
})
