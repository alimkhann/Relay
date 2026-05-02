import { z } from "zod"

export const extensionTokenInputSchema = z.object({
  deviceName: z.string().min(2).max(80),
  purpose: z.enum(["manual", "cli_mcp"]).optional()
})
