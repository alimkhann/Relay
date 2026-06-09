/** True when v2 tables are not present yet (safe to fall back). */
export function isV2RolloutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : ""
  const message = error instanceof Error ? error.message : String(error)
  return (
    code === "42P01" ||
    /relation .* does not exist/i.test(message) ||
    /v2 tables not present/i.test(message)
  )
}