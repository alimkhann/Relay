import { NextResponse } from "next/server"

import { listContextHistory } from "@/server/services/context-service"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const packets = await listContextHistory(id)
  return NextResponse.json({ packets })
}
