import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"

export const POST = withApiAuth(async (_request: Request) => {
  return NextResponse.json(
    { error: "Extension web pairing has been removed. Use Google sign-in from the extension." },
    { status: 410 }
  )
})
