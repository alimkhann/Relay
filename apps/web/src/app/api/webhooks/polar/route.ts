import { NextResponse } from "next/server"

import { handlePolarWebhook } from "@/server/services/billing-service"

export const POST = async (request: Request) => {
  const rawBody = await request.text()
  await handlePolarWebhook(rawBody, request.headers)
  return new NextResponse(null, { status: 202 })
}
