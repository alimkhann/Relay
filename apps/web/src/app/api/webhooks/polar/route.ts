import { NextResponse } from "next/server"

import { handlePolarWebhook } from "@/server/services/billing-service"
import { logServerEvent } from "@/server/logging/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = async (request: Request) => {
  const rawBody = await request.text()

  try {
    await handlePolarWebhook(rawBody, request.headers)
  } catch (error) {
    // handlePolarWebhook is responsible for its own persistence (raw delivery
    // row + error_message). We log here as a second layer and still return 202
    // so Polar stops retrying — manual replay will be done from our own
    // billing_webhook_raw_deliveries table once we've diagnosed the failure.
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "billing",
      event: "billing.webhook_route_exception",
      message: "Polar webhook handler threw after raw delivery persistence.",
      context: {
        provider: "polar",
      },
      error,
    })
  }

  return new NextResponse(null, { status: 202 })
}
