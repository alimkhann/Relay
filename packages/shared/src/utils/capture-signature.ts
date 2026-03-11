import type { CapturePayload, ParsedTurn } from "../types/capture"
import type { SupportedPlatform } from "../types/database"
import { hashContent } from "./hashing"
import { normalizeText } from "./text"

function normalizeTurns(turns: ParsedTurn[]) {
  return turns.map((turn) => ({
    role: turn.role,
    turnIndex: turn.turnIndex,
    content: normalizeText(turn.content)
  }))
}

export function buildCaptureSignature(input: {
  platform: SupportedPlatform
  url: string
  pageFingerprint?: string | null
  turns: ParsedTurn[]
}) {
  return hashContent(
    JSON.stringify({
      platform: input.platform,
      url: input.url,
      pageFingerprint: input.pageFingerprint ?? null,
      turns: normalizeTurns(input.turns)
    })
  )
}

export function withCaptureSignature(input: CapturePayload): CapturePayload {
  return {
    ...input,
    session: {
      ...input.session,
      captureSignature:
        input.session.captureSignature ??
        buildCaptureSignature({
          platform: input.platform,
          url: input.session.url,
          pageFingerprint: input.session.pageFingerprint,
          turns: input.turns
        })
    }
  }
}
