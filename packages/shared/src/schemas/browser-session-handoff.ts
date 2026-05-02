import { z } from "zod"

export const browserSessionHandoffStartSchema = z.object({
  googleAccessToken: z.string().trim().min(10),
  googleIdToken: z.string().trim().min(10),
  nextPath: z.string().trim().min(1).default("/dashboard")
})
