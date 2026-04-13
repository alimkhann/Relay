import type { CanonEvidenceRow, CanonEvidenceSourceKind } from "@relay/shared"

import { toCanonEvidenceRow } from "../mappers/canon-mapper"
import type { DatabaseProvider } from "../store/provider"
import { encryptTextIfConfigured } from "../utils/encrypted-text"

const CANON_EVIDENCE_COLS = `id, project_id, canon_entry_id, source_kind, source_id, excerpt, weight, created_at`

export class CanonEvidenceRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByEntry(canonEntryId: string): Promise<CanonEvidenceRow[]> {
    const rows = await this.provider.query(
      `select ${CANON_EVIDENCE_COLS}
       from canon_evidence
       where canon_entry_id = $1
       order by weight desc, created_at asc`,
      [canonEntryId],
    )

    return rows.map((row) => toCanonEvidenceRow(row as Record<string, unknown>))
  }

  async replaceForEntry(projectId: string, canonEntryId: string, evidence: Array<{
    sourceKind: CanonEvidenceSourceKind
    sourceId: string
    excerpt?: string | null
    weight?: number
  }>): Promise<CanonEvidenceRow[]> {
    await this.provider.query(`delete from canon_evidence where canon_entry_id = $1`, [canonEntryId])

    if (evidence.length === 0) {
      return []
    }

    const placeholders: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    for (const item of evidence) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`)
      params.push(
        projectId,
        canonEntryId,
        item.sourceKind,
        item.sourceId,
        item.excerpt ? encryptTextIfConfigured(item.excerpt) : null,
        item.weight ?? 0.5,
      )
      paramIndex += 6
    }

    const rows = await this.provider.query(
      `insert into canon_evidence (project_id, canon_entry_id, source_kind, source_id, excerpt, weight)
       values ${placeholders.join(", ")}
       returning ${CANON_EVIDENCE_COLS}`,
      params,
    )

    return rows.map((row) => toCanonEvidenceRow(row as Record<string, unknown>))
  }
}
