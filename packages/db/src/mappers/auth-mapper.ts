import type { BrowserSessionHandoffRow, ExtensionApiTokenRow, ProfileRow, UserOnboardingRow } from "@relay/shared"

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

export function toUserOnboardingRow(record: Record<string, unknown>): UserOnboardingRow {
  return {
    userId: String(record.user_id),
    status: record.status as UserOnboardingRow["status"],
    completedProjectId: record.completed_project_id ? String(record.completed_project_id) : null,
    completedVia: record.completed_via ? (String(record.completed_via) as UserOnboardingRow["completedVia"]) : null,
    completedAt: record.completed_at ? String(record.completed_at) : null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  }
}

export function toBrowserSessionHandoffRow(record: Record<string, unknown>): BrowserSessionHandoffRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    handoffHash: String(record.handoff_hash),
    handoffPrefix: String(record.handoff_prefix),
    encryptedGoogleAccessToken: String(record.encrypted_google_access_token),
    encryptedGoogleIdToken: String(record.encrypted_google_id_token),
    nextPath: String(record.next_path),
    expiresAt: String(record.expires_at),
    consumedAt: record.consumed_at ? String(record.consumed_at) : null,
    createdAt: String(record.created_at)
  }
}
