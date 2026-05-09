import { NextResponse } from "next/server"

import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

const REASON_IDS = [
  "too_complex",
  "missing_feature",
  "switching_tool",
  "just_trying",
  "price",
  "other",
] as const

type ReasonId = (typeof REASON_IDS)[number]

const REASON_SET = new Set<string>(REASON_IDS)
const MAX_NOTE_LENGTH = 1000
const MAX_HEADER_LENGTH = 300

function normalizeReasons(value: unknown): ReasonId[] | null {
  if (!Array.isArray(value)) return []

  const reasons: ReasonId[] = []
  for (const item of value) {
    if (typeof item !== "string" || !REASON_SET.has(item)) {
      return null
    }
    if (!reasons.includes(item as ReasonId)) {
      reasons.push(item as ReasonId)
    }
  }
  return reasons
}

function normalizeNote(value: unknown) {
  if (value == null) return null
  if (typeof value !== "string") return null

  const note = value.trim()
  if (!note) return null
  return note.slice(0, MAX_NOTE_LENGTH)
}

function trimHeader(value: string | null) {
  return value ? value.slice(0, MAX_HEADER_LENGTH) : null
}

export async function POST(request: Request) {
  await assertIpRateLimit(request, "extension_uninstall_feedback_ip", 10)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const reasons = normalizeReasons(input.reasons)
  if (!reasons) {
    return NextResponse.json({ error: "Invalid feedback reason." }, { status: 400 })
  }

  const note = normalizeNote(input.note)
  const properties = {
    source: "extension_uninstall",
    reasons: reasons.join(","),
    reason_count: reasons.length,
    reason_too_complex: reasons.includes("too_complex"),
    reason_missing_feature: reasons.includes("missing_feature"),
    reason_switching_tool: reasons.includes("switching_tool"),
    reason_just_trying: reasons.includes("just_trying"),
    reason_price: reasons.includes("price"),
    reason_other: reasons.includes("other"),
    note,
    note_length: note?.length ?? 0,
    path: new URL(request.url).pathname,
    referrer: trimHeader(request.headers.get("referer")),
    user_agent: trimHeader(request.headers.get("user-agent")),
  }

  captureServerEvent({
    event: "extension_uninstall_feedback_submitted",
    distinctId: `anon-${crypto.randomUUID()}`,
    properties,
  })

  return NextResponse.json({ ok: true })
}
