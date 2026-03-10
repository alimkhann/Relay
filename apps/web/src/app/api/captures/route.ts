import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { saveCapture } from "@/server/services/capture-service"

export async function POST(request: Request) {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const capture = await saveCapture(viewer.userId, await request.json())
  return NextResponse.json(capture, { status: 201 })
}
