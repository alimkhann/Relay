import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { listContextHistory } from "@/server/services/context-service"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const packets = await listContextHistory(viewer.userId, id)
  return NextResponse.json({ packets })
}
