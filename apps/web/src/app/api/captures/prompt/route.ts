import { createRepositoryBundle } from "@relay/db"
import { NextResponse } from "next/server"
import { z } from "zod"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { embedAndRelateItems } from "@/server/services/memory-service"

const promptCaptureSchema = z.object({
  projectId: z.string().min(1),
  platform: z.string().min(1),
  promptText: z.string().min(5).max(10000),
  url: z.string().optional(),
  conversationId: z.string().optional(),
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)

  const body = promptCaptureSchema.parse(await request.json())
  const repos = createRepositoryBundle(viewer.userId)

  // Dedup: skip if identical content exists in this project within last 5 minutes
  const existing = await repos.memory.search(body.projectId, body.promptText, { limit: 1 })
  if (existing.length > 0) {
    const mostRecent = existing[0]!
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    if (new Date(mostRecent.createdAt).getTime() > fiveMinutesAgo && mostRecent.content === body.promptText) {
      return NextResponse.json({ skipped: true, reason: "duplicate" })
    }
  }

  const item = await repos.memory.create(viewer.userId, {
    projectId: body.projectId,
    type: "note",
    title: body.promptText.length > 80 ? body.promptText.slice(0, 77) + "..." : body.promptText,
    content: body.promptText,
    tags: ["prompt", body.platform],
    metadata: { source: "prompt_capture", platform: body.platform },
    sourceSurface: body.platform as "chatgpt" | "claude" | "gemini" | "grok" | "perplexity" | "deepseek" | "codex",
    sourceUrl: body.url ?? null,
    sourceConversationId: body.conversationId ?? null,
    capturedAt: new Date().toISOString(),
  })

  // Fire-and-forget: embedding + relation detection
  void embedAndRelateItems([item], repos)

  return NextResponse.json({ item: { id: item.id, type: item.type } }, { status: 201 })
})
