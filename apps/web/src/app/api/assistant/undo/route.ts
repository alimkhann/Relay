import { NextResponse } from "next/server"

import { z } from "zod"

import { RelayHttpMcpClient } from "@/app/api/mcp/stream/relay-http-mcp-client"
import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"

const undoSchema = z.object({
  tool: z.literal("manage_memory"),
  args: z.object({
    action: z.enum(["delete", "archive"]),
    memoryId: z.array(z.string()).min(1)
  })
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { args } = undoSchema.parse(await request.json())
  const client = new RelayHttpMcpClient(viewer)
  await client.manageMemory(args)
  return NextResponse.json({ ok: true })
})
