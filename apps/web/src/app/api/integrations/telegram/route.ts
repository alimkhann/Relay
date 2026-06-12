import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import {
  createTelegramPairingCode,
  disconnectTelegramForUser,
  getTelegramAccountForUser,
  getTelegramBotUsername,
  isTelegramConfigured,
} from "@/server/services/integrations/telegram-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const account = await getTelegramAccountForUser(viewer.userId)
  return NextResponse.json({
    configured: isTelegramConfigured(),
    botUsername: getTelegramBotUsername(),
    connected: Boolean(account),
    accountLabel: account
      ? typeof account.metadata.username === "string" && account.metadata.username
        ? `@${account.metadata.username}`
        : "Telegram"
      : null,
  })
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: "Telegram integration is not configured." }, { status: 503 })
  }
  const { code, expiresAt } = await createTelegramPairingCode(viewer.userId)
  const botUsername = getTelegramBotUsername()
  return NextResponse.json({
    code,
    expiresAt,
    botUsername,
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
  })
})

export const DELETE = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  await disconnectTelegramForUser(viewer.userId)
  return NextResponse.json({ ok: true })
})
