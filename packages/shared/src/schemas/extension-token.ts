import { z } from "zod"

export const extensionTokenInputSchema = z.object({
  deviceName: z.string().min(2).max(80)
})
