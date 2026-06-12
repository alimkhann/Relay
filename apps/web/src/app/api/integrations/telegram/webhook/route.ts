import { NextResponse } from "next/server"

import type { AssistantStreamEvent } from "@relay/shared"

import { logServerEvent } from "@/server/logging/logger"
import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { withApiRoute } from "@/server/http/api-route"
import { TooManyRequestsError } from "@/server/http/errors"
import type { Viewer } from "@/server/policies/viewer"
import { runAssistantTurn } from "@/server/services/assistant-agent-service"
import {
  assertAssistantTokenBudget,
  consumeAssistantMessageQuota,
  consumeAssistantTokenQuota,
  resolveViewerEntitlements,
} from "@/server/services/entitlement-service"
import {
  answerTelegramCallback,
  clearTelegramButtons,
  consumeTelegramPairingCode,
  downloadTelegramFile,
  getTelegramAccountByChatId,
  getTelegramWebhookSecret,
  isTelegramConfigured,
  listRecentAssistantChats,
  patchTelegramAccountMetadata,
  rememberTelegramAssistantChat,
  resetTelegramAssistantChat,
  sendTelegramMessage,
  sendTelegramTyping,
  type TelegramAccount,
  type TelegramInlineButton,
} from "@/server/services/integrations/telegram-service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const WELCOME_MESSAGE = [
  "This is Relay — your memory across AI tools, now in Telegram.",
  "",
  "To connect this chat to your Relay account:",
  "1. Open onrelay.app/settings → Integrations",
  "2. Tap \"Connect Telegram\" — it opens this bot with your code, or paste the code here",
  "",
  "Once connected, this is a direct line to your Relay agent: ask about your projects, save things to memory, recall decisions.",
].join("\n")

const HELP_MESSAGE = [
  "I'm Relay — the same agent as your dashboard and extension, with full access to your memory, projects, sources, and (if connected) calendar and email.",
  "",
  "Examples:",
  "· What are my open tasks?",
  "· Remember that <fact>",
  "· What did we decide about <topic>?",
  "· What's on my calendar tomorrow?",
  "· You can also send me photos.",
  "",
  "Commands:",
  "/new — start a fresh conversation",
  "/chats — continue a conversation from the dashboard or extension",
  "/settings — preferences",
  "",
  "Changes that can't be undone ask for your approval first.",
].join("\n")

const PAIRING_CODE_PATTERN = /^relay-[a-f0-9]{8}$/i
const CONFIRM_PATTERN = /^(yes|y|confirm|approve|do it|go ahead|ok|okay|да|давай)\.?!?$/i
const DECLINE_PATTERN = /^(no|n|cancel|decline|stop|don'?t|нет)\.?!?$/i
/** Auto-checkpoint the rolling Telegram conversation so it never silently
 * degrades — Telegram has no "new chat" button, the session just grows. */
const TURNS_BETWEEN_AUTO_COMPACT = 30

interface TelegramUpdate {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    caption?: string
    photo?: Array<{ file_id?: string; file_size?: number; width?: number }>
    chat?: { id?: number; type?: string }
    from?: { id?: number; username?: string; first_name?: string; is_bot?: boolean }
  }
  callback_query?: {
    id?: string
    data?: string
    message?: { message_id?: number; chat?: { id?: number } }
    from?: { id?: number; is_bot?: boolean }
  }
}

type ActionDecision = { actionId: string; actionIds: string[]; decision: "allow" | "decline" }

function approveButtons(): TelegramInlineButton[][] {
  return [
    [
      { text: "✅ Approve", callback_data: "act:allow" },
      { text: "❌ Decline", callback_data: "act:decline" },
    ],
  ]
}

async function runTelegramAgentTurn(
  account: TelegramAccount,
  chatId: string,
  text: string,
  options: {
    actionDecision?: ActionDecision | null
    inlineImages?: Array<{ mimeType: string; data: string }>
  } = {},
) {
  const viewer: Viewer = { userId: account.userId, mode: "session" }
  const actionDecision = options.actionDecision ?? null

  try {
    await assertAssistantTokenBudget(account.userId)
    // Confirmations resume an existing turn — not a new billable message.
    if (!actionDecision) await consumeAssistantMessageQuota(account.userId)
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      await sendTelegramMessage(chatId, `${error.message}\n\nUpgrade at onrelay.app/settings`)
      return
    }
    throw error
  }

  const entitlements = await resolveViewerEntitlements(account.userId)
  captureServerEvent({
    event: "assistant_message_sent",
    distinctId: account.userId,
    properties: { surface: "telegram", plan: entitlements.plan, intentRoute: "telegram" },
  })

  const existingChatId =
    typeof account.metadata.assistantChatId === "string" ? account.metadata.assistantChatId : null
  const turnsSinceCompact =
    typeof account.metadata.turnsSinceCompact === "number" ? account.metadata.turnsSinceCompact : 0
  const autoApprove = account.metadata.autoApprove === true

  const typingInterval = setInterval(() => void sendTelegramTyping(chatId), 5000)
  void sendTelegramTyping(chatId)

  let totalTokens = 0
  let replyText = ""
  const pendingActions: Array<{ id: string; summary: string }> = []
  let assistantChatId: string | null = null

  try {
    // Silent auto-compaction keeps the rolling session inside the model's
    // working window without the user managing sessions from Telegram.
    if (existingChatId && !actionDecision && turnsSinceCompact >= TURNS_BETWEEN_AUTO_COMPACT) {
      const compactTurn = runAssistantTurn(
        viewer,
        { chatId: existingChatId, surface: "telegram", projectId: null, message: "/compact" },
        { plan: entitlements.plan, maxSteps: 1 },
      )
      for await (const event of compactTurn as AsyncGenerator<AssistantStreamEvent>) {
        if (event.type === "usage") totalTokens += event.totalTokens
      }
      await patchTelegramAccountMetadata(account.id, { turnsSinceCompact: 0 }).catch(() => {})
    }

    const turn = runAssistantTurn(
      viewer,
      {
        chatId: existingChatId,
        surface: "telegram",
        projectId: null,
        message: actionDecision
          ? `${actionDecision.decision === "allow" ? "Allow" : "Decline"} pending actions`
          : text.slice(0, 8000),
        ...(actionDecision ? { actionDecision } : {}),
        ...(autoApprove ? { autoApproveDestructive: true } : {}),
        ...(options.inlineImages?.length ? { inlineImages: options.inlineImages } : {}),
      },
      { plan: entitlements.plan, maxSteps: entitlements.limits.assistantMaxSteps },
    )

    for await (const event of turn as AsyncGenerator<AssistantStreamEvent>) {
      switch (event.type) {
        case "chat":
          assistantChatId = event.chatId
          break
        case "text":
          replyText += event.delta
          break
        case "pending_action":
          pendingActions.push({ id: event.action.id, summary: event.action.summary })
          break
        case "action_update":
          if (event.action.status === "succeeded") {
            replyText = replyText || `Done: ${event.action.summary}.`
          } else if (event.action.status === "declined") {
            replyText = replyText || "Cancelled."
          } else if (event.action.status === "failed") {
            replyText = replyText || `Couldn't ${event.action.summary}: ${event.action.error ?? "failed"}.`
          }
          break
        case "usage":
          totalTokens += event.totalTokens
          break
        case "error":
          if (!replyText) replyText = event.message
          break
        default:
          break
      }
    }
  } finally {
    clearInterval(typingInterval)
    if (totalTokens > 0) {
      await consumeAssistantTokenQuota(account.userId, totalTokens).catch(() => {})
    }
  }

  if (assistantChatId && assistantChatId !== existingChatId) {
    await rememberTelegramAssistantChat(account.id, assistantChatId).catch(() => {})
  }
  if (!actionDecision) {
    await patchTelegramAccountMetadata(account.id, {
      turnsSinceCompact: turnsSinceCompact + 1,
    }).catch(() => {})
  }

  if (pendingActions.length > 0) {
    await patchTelegramAccountMetadata(account.id, {
      pendingActionIds: pendingActions.map((action) => action.id),
    }).catch(() => {})
    const note = `Approval needed: ${pendingActions.map((a) => a.summary).join("; ")}.`
    await sendTelegramMessage(chatId, replyText ? `${replyText}\n\n${note}` : note, {
      buttons: approveButtons(),
    })
    return
  }

  await sendTelegramMessage(chatId, replyText || "Done.")
}

function settingsButtons(autoApprove: boolean): TelegramInlineButton[][] {
  return [
    [
      {
        text: `Auto-approve actions: ${autoApprove ? "ON" : "OFF"}`,
        callback_data: `set:autoapprove:${autoApprove ? "off" : "on"}`,
      },
    ],
    [{ text: "🆕 New conversation", callback_data: "new" }],
    [{ text: "❓ Help", callback_data: "help" }],
  ]
}

async function handleCallbackQuery(update: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatIdRaw = update.message?.chat?.id
  const data = update.data ?? ""
  const callbackId = update.id ?? ""
  if (!chatIdRaw || !data) {
    await answerTelegramCallback(callbackId)
    return
  }
  const chatId = String(chatIdRaw)
  const account = await getTelegramAccountByChatId(chatId)
  if (!account) {
    await answerTelegramCallback(callbackId, "Not connected.")
    return
  }

  if (data === "act:allow" || data === "act:decline") {
    const storedPending = Array.isArray(account.metadata.pendingActionIds)
      ? (account.metadata.pendingActionIds as string[]).filter((id) => typeof id === "string")
      : []
    await answerTelegramCallback(callbackId, data === "act:allow" ? "Approved" : "Declined")
    if (update.message?.message_id) {
      await clearTelegramButtons(chatId, update.message.message_id)
    }
    if (storedPending.length === 0) {
      await sendTelegramMessage(chatId, "That approval already expired — ask me again.")
      return
    }
    await patchTelegramAccountMetadata(account.id, { pendingActionIds: null }).catch(() => {})
    await runTelegramAgentTurn(account, chatId, "", {
      actionDecision: {
        actionId: storedPending[0]!,
        actionIds: storedPending,
        decision: data === "act:allow" ? "allow" : "decline",
      },
    })
    return
  }

  if (data.startsWith("set:autoapprove:")) {
    const next = data.endsWith(":on")
    await patchTelegramAccountMetadata(account.id, { autoApprove: next })
    await answerTelegramCallback(callbackId, `Auto-approve ${next ? "enabled" : "disabled"}`)
    if (update.message?.message_id) {
      await clearTelegramButtons(chatId, update.message.message_id)
    }
    await sendTelegramMessage(
      chatId,
      next
        ? "Auto-approve is ON — I'll execute destructive actions without asking. Turn it off in /settings anytime."
        : "Auto-approve is OFF — I'll ask before destructive actions.",
      { buttons: settingsButtons(next) },
    )
    return
  }

  if (data.startsWith("chat:")) {
    const targetChatId = data.slice(5)
    await rememberTelegramAssistantChat(account.id, targetChatId).catch(() => {})
    await patchTelegramAccountMetadata(account.id, { turnsSinceCompact: 0 }).catch(() => {})
    await answerTelegramCallback(callbackId, "Conversation switched")
    if (update.message?.message_id) {
      await clearTelegramButtons(chatId, update.message.message_id)
    }
    await sendTelegramMessage(chatId, "Continuing that conversation — go ahead.")
    return
  }

  if (data === "new") {
    await resetTelegramAssistantChat(account.id)
    await answerTelegramCallback(callbackId, "New conversation")
    await sendTelegramMessage(chatId, "Fresh conversation started.")
    return
  }

  if (data === "help") {
    await answerTelegramCallback(callbackId)
    await sendTelegramMessage(chatId, HELP_MESSAGE)
    return
  }

  await answerTelegramCallback(callbackId)
}

export const POST = withApiRoute(async (request: Request) => {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: true })
  }

  const secret = getTelegramWebhookSecret()
  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 })
  }

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate

  if (update.callback_query && !update.callback_query.from?.is_bot) {
    try {
      await handleCallbackQuery(update.callback_query)
    } catch (error) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "integrations",
        event: "telegram.callback_failed",
        message: "Telegram callback handling failed.",
        context: { reason: error instanceof Error ? error.message : "unknown" },
        error,
      })
    }
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  const chatIdRaw = message?.chat?.id
  const text = (message?.text ?? message?.caption ?? "").trim()
  const hasPhoto = Boolean(message?.photo?.length)

  // Only private chats with real users; ignore everything else quietly.
  if (!chatIdRaw || (!text && !hasPhoto) || message?.from?.is_bot || message?.chat?.type !== "private") {
    return NextResponse.json({ ok: true })
  }
  const chatId = String(chatIdRaw)

  try {
    const account = await getTelegramAccountByChatId(chatId)

    // /start may carry a deep-linked pairing code: "/start relay-xxxxxxxx".
    const startPayload = text.startsWith("/start") ? text.slice(6).trim() : null
    const candidateCode = startPayload || text
    if (!account) {
      if (PAIRING_CODE_PATTERN.test(candidateCode)) {
        const paired = await consumeTelegramPairingCode(candidateCode, {
          chatId,
          username: message?.from?.username ?? null,
          firstName: message?.from?.first_name ?? null,
        })
        if (paired) {
          captureServerEvent({
            event: "integration_connected",
            distinctId: paired.userId,
            properties: { provider: "telegram", surface: "telegram" },
            set: {
              is_telegram_connected: true,
              telegram_username: message?.from?.username ?? null,
            },
          })
          await sendTelegramMessage(
            chatId,
            "Connected. This chat now has full access to your Relay memory.\n\nTry: \"What are my open tasks?\" or \"Remember that …\". Send /help for more.",
          )
        } else {
          await sendTelegramMessage(
            chatId,
            "That code is invalid or expired. Generate a fresh one at onrelay.app/settings → Integrations.",
          )
        }
        return NextResponse.json({ ok: true })
      }
      await sendTelegramMessage(chatId, WELCOME_MESSAGE)
      return NextResponse.json({ ok: true })
    }

    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Already connected. Ask me anything about your projects and memory — /help shows what I can do.",
      )
      return NextResponse.json({ ok: true })
    }

    if (text === "/new") {
      await resetTelegramAssistantChat(account.id)
      await sendTelegramMessage(chatId, "Fresh conversation started.")
      return NextResponse.json({ ok: true })
    }

    if (text === "/help") {
      await sendTelegramMessage(chatId, HELP_MESSAGE)
      return NextResponse.json({ ok: true })
    }

    if (text === "/settings") {
      const autoApprove = account.metadata.autoApprove === true
      await sendTelegramMessage(chatId, "Settings", { buttons: settingsButtons(autoApprove) })
      return NextResponse.json({ ok: true })
    }

    if (text === "/chats") {
      const chats = await listRecentAssistantChats(account.userId)
      if (chats.length === 0) {
        await sendTelegramMessage(chatId, "No conversations yet.")
        return NextResponse.json({ ok: true })
      }
      const buttons: TelegramInlineButton[][] = chats.map((chat) => [
        {
          text: `${chat.surface === "telegram" ? "✈️" : chat.surface === "extension" ? "🧩" : "🖥"} ${chat.title.slice(0, 40)}`,
          callback_data: `chat:${chat.id}`,
        },
      ])
      await sendTelegramMessage(chatId, "Pick a conversation to continue here:", { buttons })
      return NextResponse.json({ ok: true })
    }

    // Pending confirmation typed as text (buttons are primary, text works too).
    const storedPending = Array.isArray(account.metadata.pendingActionIds)
      ? (account.metadata.pendingActionIds as string[]).filter((id) => typeof id === "string")
      : []
    if (storedPending.length > 0 && (CONFIRM_PATTERN.test(text) || DECLINE_PATTERN.test(text))) {
      await patchTelegramAccountMetadata(account.id, { pendingActionIds: null }).catch(() => {})
      await runTelegramAgentTurn(account, chatId, "", {
        actionDecision: {
          actionId: storedPending[0]!,
          actionIds: storedPending,
          decision: CONFIRM_PATTERN.test(text) ? "allow" : "decline",
        },
      })
      return NextResponse.json({ ok: true })
    }
    if (storedPending.length > 0) {
      // User moved on — drop the stale pending state.
      await patchTelegramAccountMetadata(account.id, { pendingActionIds: null }).catch(() => {})
    }

    // Photos → inline vision input.
    let inlineImages: Array<{ mimeType: string; data: string }> | undefined
    if (hasPhoto) {
      const sizes = message!.photo!
      const best = [...sizes]
        .filter((p) => (p.file_size ?? 0) <= 4 * 1024 * 1024)
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
      if (best?.file_id) {
        const file = await downloadTelegramFile(best.file_id)
        if (file) inlineImages = [file]
      }
      if (!inlineImages) {
        await sendTelegramMessage(chatId, "I couldn't read that image (too large or unavailable).")
        if (!text) return NextResponse.json({ ok: true })
      }
    }

    await runTelegramAgentTurn(account, chatId, text || "What's in this image?", { inlineImages })
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown"
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : null
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "integrations",
      event: "telegram.webhook_failed",
      message: "Telegram webhook processing failed.",
      context: { reason, cause, chatId },
      error,
    })
    await sendTelegramMessage(chatId, "Something went wrong on my side — try again in a moment.").catch(() => {})
  }

  // Always 200 so Telegram doesn't redeliver the update.
  return NextResponse.json({ ok: true })
})
