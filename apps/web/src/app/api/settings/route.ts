import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { getUserSettings, updateUserSettings } from "@/server/services/settings-service"

export async function GET(request: Request) {
  const viewer = await resolveViewer(request.headers.get("authorization")?.replace("Bearer ", ""))
  const settings = await getUserSettings(viewer.userId)
  return NextResponse.json({ settings })
}

export async function PATCH(request: Request) {
  const viewer = await resolveViewer(request.headers.get("authorization")?.replace("Bearer ", ""))
  const settings = await updateUserSettings(viewer.userId, await request.json())
  return NextResponse.json({ settings })
}
