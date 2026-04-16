import type { BrowserSessionHandoffRow, ExtensionApiTokenRow, McpAuthSessionRow, McpTokenRow, ProfileRow, UserOnboardingRow } from "@relay/shared"

import { toTimestamp } from "./timestamp"

export function toProfileRow(record: Record<string, unknown>): ProfileRow {
  return {
    id: String(record.id),
    email: record.email ? String(record.email) : null,
    displayName: record.display_name ? String(record.display_name) : null,
    avatarUrl: record.avatar_url ? String(record.avatar_url) : null,
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at)
  }
}

export function toExtensionApiTokenRow(record: Record<string, unknown>): ExtensionApiTokenRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    deviceName: String(record.device_name),
    purpose: record.purpose === "cli_mcp" ? "cli_mcp" : "manual",
    tokenHash: String(record.token_hash),
    tokenPrefix: String(record.token_prefix),
    lastUsedAt: record.last_used_at ? toTimestamp(record.last_used_at) : null,
    expiresAt: record.expires_at ? toTimestamp(record.expires_at) : null,
    createdAt: toTimestamp(record.created_at),
    revokedAt: record.revoked_at ? toTimestamp(record.revoked_at) : null
  }
}

export function toUserOnboardingRow(record: Record<string, unknown>): UserOnboardingRow {
  return {
    userId: String(record.user_id),
    status: record.status as UserOnboardingRow["status"],
    completedProjectId: record.completed_project_id ? String(record.completed_project_id) : null,
    completedVia: record.completed_via ? (String(record.completed_via) as UserOnboardingRow["completedVia"]) : null,
    completedAt: record.completed_at ? toTimestamp(record.completed_at) : null,
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at)
  }
}

export function toMcpTokenRow(record: Record<string, unknown>): McpTokenRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    projectId: String(record.project_id),
    tokenHash: String(record.token_hash),
    tokenPrefix: String(record.token_prefix),
    scopes: Array.isArray(record.scopes) ? record.scopes.map((scope) => String(scope)) as McpTokenRow["scopes"] : [],
    expiresAt: toTimestamp(record.expires_at),
    refreshTokenHash: record.refresh_token_hash ? String(record.refresh_token_hash) : null,
    refreshTokenPrefix: record.refresh_token_prefix ? String(record.refresh_token_prefix) : null,
    refreshExpiresAt: record.refresh_expires_at ? toTimestamp(record.refresh_expires_at) : null,
    lastUsedAt: record.last_used_at ? toTimestamp(record.last_used_at) : null,
    rotationCount: Number(record.rotation_count ?? 0),
    revokedAt: record.revoked_at ? toTimestamp(record.revoked_at) : null,
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at)
  }
}

export function toMcpAuthSessionRow(record: Record<string, unknown>): McpAuthSessionRow {
  return {
    id: String(record.id),
    sessionCode: String(record.session_code),
    sessionHash: String(record.session_hash),
    sessionPrefix: String(record.session_prefix),
    codeChallenge: String(record.code_challenge),
    projectId: String(record.project_id),
    scopes: Array.isArray(record.scopes) ? record.scopes.map((scope) => String(scope)) as McpAuthSessionRow["scopes"] : [],
    userId: record.user_id ? String(record.user_id) : null,
    status: String(record.status) as McpAuthSessionRow["status"],
    expiresAt: toTimestamp(record.expires_at),
    approvedAt: record.approved_at ? toTimestamp(record.approved_at) : null,
    createdAt: toTimestamp(record.created_at)
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
    expiresAt: toTimestamp(record.expires_at),
    consumedAt: record.consumed_at ? toTimestamp(record.consumed_at) : null,
    createdAt: toTimestamp(record.created_at)
  }
}
