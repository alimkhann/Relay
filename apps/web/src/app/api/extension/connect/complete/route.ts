import { NextResponse } from "next/server"

import { completeExtensionConnect } from "@/server/services/extension-connect-service"

export async function POST(request: Request) {
  try {
    const result = await completeExtensionConnect(await request.json())
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extension pairing failed." },
      { status: 400 }
    )
  }
}
