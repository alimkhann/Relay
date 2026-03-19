import { z } from "zod"

export const billingCheckoutSchema = z.object({
  interval: z.enum(["month", "year"]),
})
