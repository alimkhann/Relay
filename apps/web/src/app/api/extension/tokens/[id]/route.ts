import { NextResponse } from "next/server"

import { requireSessionViewer } from "@/server/policies/viewer"
import { revokeExtensionTokenForUser } from "@/server/services/extension-token-service"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSessionViewer()
  const { id } = await params
  await revokeExtensionTokenForUser(viewer.userId, id)
  return new NextResponse(null, { status: 204 })
}
