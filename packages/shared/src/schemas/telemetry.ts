import { z } from "zod"

import { telemetryLevels, telemetrySurfaces } from "../types/telemetry"

const telemetryErrorSchema = z
  .object({
    name: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    stack: z.string().nullable().optional(),
    cause: z.string().nullable().optional()
  })
  .nullable()
  .optional()

export const telemetryEventSchema = z.object({
  timestamp: z.string().datetime().optional(),
  level: z.enum(telemetryLevels),
  surface: z.enum(telemetrySurfaces),
  area: z.string().min(1).max(80),
  event: z.string().min(1).max(120),
  message: z.string().min(1).max(400),
  requestId: z.string().max(120).nullable().optional(),
  flowId: z.string().max(120).nullable().optional(),
  userId: z.string().max(120).nullable().optional(),
  projectId: z.string().max(120).nullable().optional(),
  sessionId: z.string().max(120).nullable().optional(),
  tabId: z.number().int().nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  error: telemetryErrorSchema
})

export const telemetryBatchSchema = z.object({
  logs: z.array(telemetryEventSchema).min(1).max(50)
})
