import { z } from "zod"

export const composeContextSchema = z.object({
  targetProfileKey: z.enum(["chatgpt_planning", "perplexity_research", "claude_code_build", "codex_implementation"])
})
