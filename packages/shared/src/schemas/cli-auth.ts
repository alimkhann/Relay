import { z } from "zod"

export const cliAuthConfirmSchema = z.object({
  sessionCode: z.string().min(9).max(9)
})
