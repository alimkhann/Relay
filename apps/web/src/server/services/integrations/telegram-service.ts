import { randomBytes } from "node:crypto"

import { createRepositoryBundle, createServiceRepositoryProvider } from "@relay/db"

import { logServerEvent } from "@/server/logging/logger"
import { formatTelegramHtml, formatTelegramPlain } from "@/server/services/integrations/telegram-format"

const TELEGRAM_API_BASE = "https://api.telegram.org"
const PAIRING_CODE_TTL_MS = 15 * 60 * 1000

export interface TelegramAccount {
  id: string
  userId: string
  chatId: string
  status: string
  metadata: Record<string, unknown>
}

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null
}

export function getTelegramWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null
}

export function getTelegramBotUsername() {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || null
}

export function isTelegramConfigured() {
  return Boolean(getBotToken() && getTelegramWebhookSecret())
}

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const token = getBotToken()
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.")
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string }
  if (!response.ok || body.ok === false) {
    throw new Error(body.description ?? `Telegram ${method} failed with status ${response.status}.`)
  }
  return body
}

export interface TelegramInlineButton {
  text: string
  callback_data: string
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: { buttons?: TelegramInlineButton[][] } = {},
) {
  const chunks = splitTelegramMessage(text)
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!
    const html = formatTelegramHtml(chunk)
    const plain = formatTelegramPlain(chunk)
    // Buttons attach to the LAST chunk so they sit under the full message.
    const replyMarkup =
      options.buttons && index === chunks.length - 1
        ? { reply_markup: { inline_keyboard: options.buttons } }
        : {}
    try {
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        ...replyMarkup,
      })
    } catch {
      try {
        await callTelegram("sendMessage", { chat_id: chatId, text: plain, ...replyMarkup })
      } catch (error) {
        void logServerEvent({
          level: "warn",
          surface: "web-api",
          area: "integrations",
          event: "telegram.send_failed",
          message: "Failed to send Telegram message.",
          context: { reason: error instanceof Error ? error.message : "unknown" },
        })
      }
    }
  }
}

export async function sendTelegramTyping(chatId: string) {
  await callTelegram("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {})
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  await callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  }).catch(() => {})
}

/** Remove the inline keyboard from a message after its buttons were used. */
export async function clearTelegramButtons(chatId: string, messageId: number) {
  await callTelegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {})
}

/** Download a Telegram file (photo) and return it base64-encoded. */
export async function downloadTelegramFile(
  fileId: string,
): Promise<{ data: string; mimeType: string } | null> {
  const token = getBotToken()
  if (!token) return null
  try {
    const meta = (await callTelegram("getFile", { file_id: fileId })) as {
      result?: { file_path?: string; file_size?: number }
    }
    const filePath = meta.result?.file_path
    if (!filePath || (meta.result?.file_size ?? 0) > 4 * 1024 * 1024) return null
    const response = await fetch(`${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const mimeType = filePath.endsWith(".png") ? "image/png" : "image/jpeg"
    return { data: buffer.toString("base64"), mimeType }
  } catch {
    return null
  }
}

/** Recent assistant chats across all surfaces — lets Telegram continue a
 * conversation started in the dashboard or extension. */
export async function listRecentAssistantChats(userId: string) {
  const provider = createServiceRepositoryProvider()
  const rows = await provider.query<{ id: string; title: string | null; surface: string }>(
    `select id, title, surface from assistant_chats
     where user_id = $1
     order by updated_at desc
     limit 5`,
    [userId],
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled",
    surface: row.surface,
  }))
}

/** Telegram caps messages at 4096 chars; split on paragraph boundaries. */
function splitTelegramMessage(text: string): string[] {
  const MAX = 4000
  if (text.length <= MAX) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > MAX) {
    let cut = rest.lastIndexOf("\n\n", MAX)
    if (cut < MAX / 2) cut = rest.lastIndexOf("\n", MAX)
    if (cut < MAX / 2) cut = MAX
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  if (rest) chunks.push(rest)
  return chunks
}

function mapAccountRow(row: Record<string, unknown>): TelegramAccount {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    chatId: String(row.external_account_id ?? ""),
    status: String(row.status ?? "active"),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }
}

/** Webhook-side lookup — no viewer context exists yet, so use the service provider. */
export async function getTelegramAccountByChatId(chatId: string): Promise<TelegramAccount | null> {
  const provider = createServiceRepositoryProvider()
  const rows = await provider.query<Record<string, unknown>>(
    `select id, user_id, external_account_id, status, metadata
     from integration_accounts
     where provider = 'telegram' and external_account_id = $1 and status = 'active'
     limit 1`,
    [chatId],
  )
  return rows[0] ? mapAccountRow(rows[0]) : null
}

export async function getTelegramAccountForUser(userId: string): Promise<TelegramAccount | null> {
  const repositories = createRepositoryBundle(userId)
  const rows = await repositories.provider.query<Record<string, unknown>>(
    `select id, user_id, external_account_id, status, metadata
     from integration_accounts
     where provider = 'telegram' and user_id = $1 and status = 'active'
     limit 1`,
    [userId],
  )
  return rows[0] ? mapAccountRow(rows[0]) : null
}

export async function disconnectTelegramForUser(userId: string) {
  const repositories = createRepositoryBundle(userId)
  await repositories.provider.query(
    `update integration_accounts set status = 'revoked'
     where provider = 'telegram' and user_id = $1`,
    [userId],
  )
}

/** Dashboard side: mint a one-time pairing code the user pastes into the bot. */
export async function createTelegramPairingCode(userId: string) {
  const repositories = createRepositoryBundle(userId)
  const code = `relay-${randomBytes(4).toString("hex")}`
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString()
  await repositories.provider.query(
    `insert into integration_pairing_codes (code, user_id, provider, expires_at)
     values ($1, $2, 'telegram', $3)`,
    [code, userId, expiresAt],
  )
  return { code, expiresAt }
}

/** Bot side: consume a pairing code and link this chat to the code's user. */
export async function consumeTelegramPairingCode(
  code: string,
  chat: { chatId: string; username?: string | null; firstName?: string | null },
): Promise<{ userId: string } | null> {
  const provider = createServiceRepositoryProvider()
  const rows = await provider.query<{ user_id: string }>(
    `update integration_pairing_codes
     set consumed_at = now()
     where code = $1 and provider = 'telegram' and consumed_at is null and expires_at > now()
     returning user_id`,
    [code.toLowerCase().trim()],
  )
  const userId = rows[0]?.user_id
  if (!userId) return null

  await provider.query(
    `insert into integration_accounts
       (user_id, provider, account_label, external_account_id, auth_type, status, metadata)
     values ($1, 'telegram', $2, $3, 'pairing_code', 'active', $4::jsonb)
     on conflict (user_id, provider, external_account_id)
     do update set status = 'active', metadata = excluded.metadata, connected_at = now()`,
    [
      userId,
      chat.username ? `@${chat.username}` : chat.firstName ?? "Telegram",
      chat.chatId,
      JSON.stringify({ username: chat.username ?? null, firstName: chat.firstName ?? null }),
    ],
  )

  void logServerEvent({
    level: "info",
    surface: "web-api",
    area: "integrations",
    event: "integration_connected",
    userId,
    message: "Telegram account paired.",
    context: { provider: "telegram" },
  })

  return { userId }
}

/** Persist the rolling assistant chat id so every Telegram message continues
 * one conversation instead of starting fresh each time. */
export async function rememberTelegramAssistantChat(accountId: string, assistantChatId: string) {
  const provider = createServiceRepositoryProvider()
  await provider.query(
    `update integration_accounts
     set metadata = metadata || jsonb_build_object('assistantChatId', $2::text), last_sync_at = now()
     where id = $1`,
    [accountId, assistantChatId],
  )
}

/** Merge arbitrary keys into the account metadata (pending confirmations,
 * turn counters, session state). */
export async function patchTelegramAccountMetadata(
  accountId: string,
  patch: Record<string, unknown>,
) {
  const provider = createServiceRepositoryProvider()
  await provider.query(
    `update integration_accounts
     set metadata = metadata || $2::jsonb, last_sync_at = now()
     where id = $1`,
    [accountId, JSON.stringify(patch)],
  )
}

/** /new — drop the rolling conversation so the next message starts fresh. */
export async function resetTelegramAssistantChat(accountId: string) {
  await patchTelegramAccountMetadata(accountId, {
    assistantChatId: null,
    pendingActionIds: null,
    turnsSinceCompact: 0,
  })
}
