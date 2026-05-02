import { z } from "zod"

export const billingCheckoutSchema = z.object({
  plan: z.enum(["starter", "pro"]).default("starter"),
  interval: z.enum(["month", "year"]),
  referralCode: z.string().min(3).max(256).optional(),
})
