import { createRepositoryBundle } from "@relay/db"

import { decryptSecret, encryptSecret } from "@/server/lib/secret-crypto"
import { logServerEvent } from "@/server/logging/logger"

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
]

export function getGoogleIntegrationClient() {
  const clientId = process.env.GOOGLE_INTEGRATION_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_INTEGRATION_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function isGoogleIntegrationConfigured() {
  return Boolean(getGoogleIntegrationClient())
}

interface GoogleAccountRow {
  id: string
  userId: string
  email: string
  scopes: string[]
  accessTokenEnc: string | null
  refreshTokenEnc: string | null
  tokenExpiresAt: string | null
}

function mapGoogleRow(row: Record<string, unknown>): GoogleAccountRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: String(row.external_account_id ?? ""),
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    accessTokenEnc: (row.encrypted_access_token as string | null) ?? null,
    refreshTokenEnc: (row.encrypted_refresh_token as string | null) ?? null,
    tokenExpiresAt: row.token_expires_at ? new Date(String(row.token_expires_at)).toISOString() : null,
  }
}

export async function getGoogleAccountForUser(userId: string): Promise<GoogleAccountRow | null> {
  const repositories = createRepositoryBundle(userId)
  const rows = await repositories.provider.query<Record<string, unknown>>(
    `select id, user_id, external_account_id, scopes, encrypted_access_token,
            encrypted_refresh_token, token_expires_at
     from integration_accounts
     where provider = 'google' and user_id = $1 and status = 'active'
     limit 1`,
    [userId],
  )
  return rows[0] ? mapGoogleRow(rows[0]) : null
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  id_token?: string
}

export async function exchangeGoogleAuthCode(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const client = getGoogleIntegrationClient()
  if (!client) throw new Error("Google integration is not configured.")
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse & { error_description?: string }
  if (!response.ok) {
    throw new Error(body.error_description ?? `Google token exchange failed (${response.status}).`)
  }
  return body
}

export async function upsertGoogleAccount(
  userId: string,
  input: { email: string; tokens: GoogleTokenResponse; scopes: string[] },
) {
  const repositories = createRepositoryBundle(userId)
  const expiresAt = new Date(Date.now() + (input.tokens.expires_in - 60) * 1000).toISOString()
  await repositories.provider.query(
    `insert into integration_accounts
       (user_id, provider, account_label, external_account_id, auth_type, scopes, status,
        encrypted_access_token, encrypted_refresh_token, token_expires_at)
     values ($1, 'google', $2, $2, 'oauth', $3, 'active', $4, $5, $6)
     on conflict (user_id, provider, external_account_id)
     do update set
       status = 'active',
       scopes = excluded.scopes,
       encrypted_access_token = excluded.encrypted_access_token,
       encrypted_refresh_token = coalesce(excluded.encrypted_refresh_token, integration_accounts.encrypted_refresh_token),
       token_expires_at = excluded.token_expires_at,
       connected_at = now()`,
    [
      userId,
      input.email,
      input.scopes,
      encryptSecret(input.tokens.access_token),
      input.tokens.refresh_token ? encryptSecret(input.tokens.refresh_token) : null,
      expiresAt,
    ],
  )
}

export async function disconnectGoogleForUser(userId: string) {
  const account = await getGoogleAccountForUser(userId)
  if (!account) return
  // Best-effort revoke so the grant disappears from the user's Google account.
  const token = account.refreshTokenEnc ?? account.accessTokenEnc
  if (token) {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(decryptSecret(token))}`, {
      method: "POST",
    }).catch(() => {})
  }
  const repositories = createRepositoryBundle(userId)
  await repositories.provider.query(
    `update integration_accounts set status = 'revoked',
       encrypted_access_token = null, encrypted_refresh_token = null
     where provider = 'google' and user_id = $1`,
    [userId],
  )
}

async function refreshAccessToken(account: GoogleAccountRow): Promise<string> {
  const client = getGoogleIntegrationClient()
  if (!client) throw new Error("Google integration is not configured.")
  if (!account.refreshTokenEnc) throw new Error("Google account has no refresh token — reconnect Google in Settings.")
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: decryptSecret(account.refreshTokenEnc),
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "refresh_token",
    }),
  })
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse & { error?: string }
  if (!response.ok) {
    if (body.error === "invalid_grant") {
      throw new Error("Google access was revoked — reconnect Google in Settings.")
    }
    throw new Error(`Google token refresh failed (${response.status}).`)
  }
  const repositories = createRepositoryBundle(account.userId)
  const expiresAt = new Date(Date.now() + (body.expires_in - 60) * 1000).toISOString()
  await repositories.provider.query(
    `update integration_accounts
     set encrypted_access_token = $2, token_expires_at = $3, last_sync_at = now()
     where id = $1`,
    [account.id, encryptSecret(body.access_token), expiresAt],
  )
  return body.access_token
}

async function getAccessToken(account: GoogleAccountRow): Promise<string> {
  const expired =
    !account.accessTokenEnc ||
    !account.tokenExpiresAt ||
    new Date(account.tokenExpiresAt).getTime() <= Date.now()
  if (expired) return refreshAccessToken(account)
  return decryptSecret(account.accessTokenEnc!)
}

/** Authenticated Google API fetch with one transparent refresh-and-retry. */
async function googleFetch(userId: string, url: string, init: RequestInit = {}) {
  const account = await getGoogleAccountForUser(userId)
  if (!account) throw new Error("Google is not connected — connect it in Settings → Integrations.")
  let token = await getAccessToken(account)
  let response = await fetch(url, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  })
  if (response.status === 401) {
    token = await refreshAccessToken(account)
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}` },
    })
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    void logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "integrations",
      event: "google.api_failed",
      message: "Google API request failed.",
      userId,
      context: { status: response.status, path: new URL(url).pathname },
    })
    throw new Error(body.error?.message ?? `Google API request failed (${response.status}).`)
  }
  if (response.status === 204) return {}
  return response.json() as Promise<Record<string, unknown>>
}

// ── Calendar ────────────────────────────────────────────────────────────────

export interface CalendarEventSummary {
  id: string
  summary: string
  start: string
  end: string
  location: string | null
  attendees: string[]
  htmlLink: string | null
}

interface RawCalendarEvent {
  id?: string
  summary?: string
  location?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string }>
}

function mapEvent(event: RawCalendarEvent): CalendarEventSummary {
  return {
    id: event.id ?? "",
    summary: event.summary ?? "(no title)",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    location: event.location ?? null,
    attendees: (event.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    htmlLink: event.htmlLink ?? null,
  }
}

export async function listCalendarEvents(
  userId: string,
  input: { timeMin?: string; timeMax?: string; query?: string; maxResults?: number },
): Promise<CalendarEventSummary[]> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(input.maxResults ?? 10, 25)),
    timeMin: input.timeMin ?? new Date().toISOString(),
  })
  if (input.timeMax) params.set("timeMax", input.timeMax)
  if (input.query) params.set("q", input.query)
  const data = await googleFetch(userId, `${CALENDAR_BASE}/calendars/primary/events?${params}`)
  return ((data.items as RawCalendarEvent[]) ?? []).map(mapEvent)
}

export async function createCalendarEvent(
  userId: string,
  input: {
    summary: string
    description?: string
    location?: string
    startIso: string
    endIso: string
    timeZone?: string
    attendees?: string[]
  },
): Promise<CalendarEventSummary> {
  const body = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) },
    end: { dateTime: input.endIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) },
    ...(input.attendees?.length ? { attendees: input.attendees.map((email) => ({ email })) } : {}),
  }
  const data = await googleFetch(userId, `${CALENDAR_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return mapEvent(data as RawCalendarEvent)
}

export async function updateCalendarEvent(
  userId: string,
  input: {
    eventId: string
    summary?: string
    description?: string
    location?: string
    startIso?: string
    endIso?: string
    timeZone?: string
  },
): Promise<CalendarEventSummary> {
  const patch: Record<string, unknown> = {}
  if (input.summary !== undefined) patch.summary = input.summary
  if (input.description !== undefined) patch.description = input.description
  if (input.location !== undefined) patch.location = input.location
  if (input.startIso) patch.start = { dateTime: input.startIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) }
  if (input.endIso) patch.end = { dateTime: input.endIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) }
  const data = await googleFetch(
    userId,
    `${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) },
  )
  return mapEvent(data as RawCalendarEvent)
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  await googleFetch(userId, `${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  })
}

// ── Gmail ───────────────────────────────────────────────────────────────────

export interface GmailMessageSummary {
  id: string
  threadId: string
  from: string
  subject: string
  date: string
  snippet: string
}

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

export async function searchGmail(
  userId: string,
  input: { query: string; maxResults?: number },
): Promise<GmailMessageSummary[]> {
  const params = new URLSearchParams({
    q: input.query,
    maxResults: String(Math.min(input.maxResults ?? 8, 20)),
  })
  const list = await googleFetch(userId, `${GMAIL_BASE}/messages?${params}`)
  const ids = ((list.messages as Array<{ id: string }>) ?? []).slice(0, 20)
  const summaries: GmailMessageSummary[] = []
  for (const { id } of ids) {
    const msg = (await googleFetch(
      userId,
      `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    )) as {
      id?: string
      threadId?: string
      snippet?: string
      payload?: { headers?: Array<{ name?: string; value?: string }> }
    }
    summaries.push({
      id: msg.id ?? id,
      threadId: msg.threadId ?? "",
      from: headerValue(msg.payload?.headers, "From"),
      subject: headerValue(msg.payload?.headers, "Subject"),
      date: headerValue(msg.payload?.headers, "Date"),
      snippet: msg.snippet ?? "",
    })
  }
  return summaries
}

interface GmailPart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
}

function extractPlainText(part: GmailPart | undefined): string {
  if (!part) return ""
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8")
  }
  for (const child of part.parts ?? []) {
    const text = extractPlainText(child)
    if (text) return text
  }
  // Fall back to stripped HTML when no text/plain part exists.
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url")
      .toString("utf8")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }
  return ""
}

export async function readGmailThread(
  userId: string,
  threadId: string,
): Promise<{ subject: string; messages: Array<{ from: string; date: string; body: string }> }> {
  const thread = (await googleFetch(userId, `${GMAIL_BASE}/threads/${encodeURIComponent(threadId)}?format=full`)) as {
    messages?: Array<{ payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> } }>
  }
  const messages = (thread.messages ?? []).map((msg) => ({
    from: headerValue(msg.payload?.headers, "From"),
    date: headerValue(msg.payload?.headers, "Date"),
    body: extractPlainText(msg.payload).slice(0, 4000),
  }))
  const subject = headerValue(thread.messages?.[0]?.payload?.headers, "Subject")
  return { subject, messages }
}

function buildRawEmail(input: { to: string; subject: string; body: string; inReplyTo?: string }) {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`] : []),
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    input.body,
  ]
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url")
}

export async function createGmailDraft(
  userId: string,
  input: { to: string; subject: string; body: string; threadId?: string },
): Promise<{ draftId: string }> {
  const data = (await googleFetch(userId, `${GMAIL_BASE}/drafts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        raw: buildRawEmail(input),
        ...(input.threadId ? { threadId: input.threadId } : {}),
      },
    }),
  })) as { id?: string }
  return { draftId: data.id ?? "" }
}

export async function sendGmail(
  userId: string,
  input: { to: string; subject: string; body: string; threadId?: string },
): Promise<{ messageId: string }> {
  const data = (await googleFetch(userId, `${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      raw: buildRawEmail(input),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  })) as { id?: string }
  return { messageId: data.id ?? "" }
}
