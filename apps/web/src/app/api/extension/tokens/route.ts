import { NextResponse } from "next/server"

import { requireSessionViewer } from "@/server/policies/viewer"
import { createExtensionTokenForUser, listExtensionTokensForUser } from "@/server/services/extension-token-service"

export async function GET() {
  const viewer = await requireSessionViewer()
  const tokens = await listExtensionTokensForUser(viewer.userId)
  return NextResponse.json({ tokens })
}

export async function POST(request: Request) {
  const viewer = await requireSessionViewer()
  const result = await createExtensionTokenForUser(viewer.userId, await request.json())
  return NextResponse.json(result, { status: 201 })
}
