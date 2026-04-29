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

const isoDatetime = z.string().datetime({ offset: true }).or(z.string().datetime())

export const composeContextSchema = z.object({
  targetProfileKey: targetProfileKeySchema,
  since: isoDatetime.optional()
})

export const bootstrapRequestSchema = z.object({
  targetProfileKey: targetProfileKeySchema,
  kind: z.enum(["quick_continuity", "fresh_chat_bootstrap"]).default("fresh_chat_bootstrap"),
  packetMode: z.enum(["chat_new", "chat_continue", "chat_smart_delta", "agent_quick_continuity", "agent_full_bootstrap"]).optional(),
  deep: z.boolean().optional(),
  since: isoDatetime.optional(),
  syncSurface: z.enum(["mcp", "cli", "chatgpt", "claude", "codex", "opencode", "gemini", "cursor", "warp", "windsurf", "antigravity", "grok", "perplexity", "deepseek"]).optional()
})
