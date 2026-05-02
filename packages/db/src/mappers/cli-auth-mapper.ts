import type { CliAuthSessionRow } from "@relay/shared"

import { toTimestamp } from "./timestamp"

export function toCliAuthSessionRow(record: Record<string, unknown>): CliAuthSessionRow {
  return {
    id: String(record.id),
    sessionCode: String(record.session_code),
    sessionHash: String(record.session_hash),
    sessionPrefix: String(record.session_prefix),
    userId: record.user_id ? String(record.user_id) : null,
    deviceName: String(record.device_name),
    status: String(record.status) as CliAuthSessionRow["status"],
    apiToken: record.api_token ? String(record.api_token) : null,
    expiresAt: toTimestamp(record.expires_at),
    confirmedAt: record.confirmed_at ? toTimestamp(record.confirmed_at) : null,
    createdAt: toTimestamp(record.created_at)
  }
}
