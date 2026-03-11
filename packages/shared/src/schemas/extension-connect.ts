import { z } from "zod"

export const extensionConnectStartSchema = z.object({
  deviceName: z.string().trim().min(2).max(80)
})

export const extensionConnectCompleteSchema = z.object({
  grantToken: z.string().trim().min(10)
})
