import type { ParsedTurn, SourceTurnRow } from "@relay/shared"
import { hashContent, isoNow, normalizeText } from "@relay/shared"

import { toTurnRow } from "../mappers/session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class TurnRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listBySession(sessionId: string): Promise<SourceTurnRow[]> {
    if (this.provider.mode === "memory") {
      return this.provider.store.turns
        .filter((turn) => turn.sessionId === sessionId)
        .sort((a, b) => a.turnIndex - b.turnIndex)
    }

    const { data, error } = await this.provider.client.from("source_turns").select("*").eq("session_id", sessionId).order("turn_index", { ascending: true })

    if (error) throw error
    return (data ?? []).map((record) => toTurnRow(record))
  }

  async insertDeduped(sessionId: string, turns: ParsedTurn[]): Promise<SourceTurnRow[]> {
    if (this.provider.mode === "memory") {
      const existingHashes = new Set(
        this.provider.store.turns.filter((turn) => turn.sessionId === sessionId).map((turn) => turn.contentHash)
      )
      const created = turns
        .map((turn) => ({
          id: crypto.randomUUID(),
          sessionId,
          role: turn.role,
          turnIndex: turn.turnIndex,
          content: normalizeText(turn.content),
          contentHash: hashContent(normalizeText(turn.content)),
          rawHtml: turn.rawHtml ?? null,
          metadata: {},
          createdAt: isoNow()
        }))
        .filter((turn) => !existingHashes.has(turn.contentHash))

      this.provider.store.turns.push(...created)
      return created
    }

    const payload = turns.map((turn) => ({
      session_id: sessionId,
      role: turn.role,
      turn_index: turn.turnIndex,
      content: normalizeText(turn.content),
      content_hash: hashContent(normalizeText(turn.content)),
      raw_html: turn.rawHtml ?? null,
      metadata: {}
    }))

    const { data, error } = await this.provider.client
      .from("source_turns")
      .upsert(payload, { onConflict: "session_id,content_hash", ignoreDuplicates: true })
      .select("*")

    if (error) throw error
    return (data ?? []).map((record) => toTurnRow(record))
  }
}
