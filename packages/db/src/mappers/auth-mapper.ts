import type { ExtensionApiTokenRow, ProfileRow } from "@relay/shared"

export function toProfileRow(record: Record<string, unknown>): ProfileRow {
  return {
    id: String(record.id),
    email: record.email ? String(record.email) : null,
    displayName: record.display_name ? String(record.display_name) : null,
    avatarUrl: record.avatar_url ? String(record.avatar_url) : null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function toExtensionApiTokenRow(record: Record<string, unknown>): ExtensionApiTokenRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    deviceName: String(record.device_name),
    tokenHash: String(record.token_hash),
    tokenPrefix: String(record.token_prefix),
    lastUsedAt: record.last_used_at ? String(record.last_used_at) : null,
    expiresAt: record.expires_at ? String(record.expires_at) : null,
    createdAt: String(record.created_at),
    revokedAt: record.revoked_at ? String(record.revoked_at) : null
  }
}
