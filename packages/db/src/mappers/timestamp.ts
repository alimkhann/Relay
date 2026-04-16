/** Convert a node-postgres Date or existing string to ISO 8601 string. */
export function toTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
