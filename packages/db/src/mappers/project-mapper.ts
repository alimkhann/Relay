import type { ProjectRow } from "@relay/shared"

export function toProjectRow(record: Record<string, unknown>): ProjectRow {
  return {
    id: String(record.id),
    ownerId: String(record.owner_id),
    name: String(record.name),
    slug: String(record.slug),
    description: record.description ? String(record.description) : null,
    isArchived: Boolean(record.is_archived),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function fromProjectInput(input: { ownerId: string; name: string; slug: string; description?: string | null }) {
  return {
    owner_id: input.ownerId,
    name: input.name,
    slug: input.slug,
    description: input.description ?? null
  }
}
