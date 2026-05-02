import type { ProjectRow } from "@relay/shared"

import { toTimestamp } from "./timestamp"

export function toProjectRow(record: Record<string, unknown>): ProjectRow {
  return {
    id: String(record.id),
    ownerId: String(record.owner_id),
    name: String(record.name),
    slug: String(record.slug),
    description: record.description ? String(record.description) : null,
    projectUrl: record.project_url ? String(record.project_url) : null,
    isArchived: Boolean(record.is_archived),
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at)
  }
}

export function fromProjectInput(input: { ownerId: string; name: string; slug: string; description?: string | null; projectUrl?: string | null }) {
  return {
    owner_id: input.ownerId,
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    project_url: input.projectUrl ?? null
  }
}
