// Single source of truth, mirrors the memory_half_lives seed in migration
// 0046. The hygiene worker reads the DB table at runtime; this map is the
// in-process fallback + drives the legacy write-path computeDecayScore. Keep
// these in sync with 0046 (and the decay.ts doc comment).
export const DECAY_HALF_LIFE_DAYS: Record<string, number> = {
  decision: 180,
  constraint: 120,
  requirement: 90,
  note: 60,
  task: 14,
  artifact: 365,
  observation: 45,
}

export const DEFAULT_HALF_LIFE_DAYS = 30
export const DECAY_ARCHIVE_THRESHOLD = 0.05
export const DECAY_VISIBILITY_THRESHOLD = 0.1

export function computeDecayScore(
  type: string,
  updatedAt: string,
  lastReaffirmedAt: string | null,
  pinned: boolean,
): number {
  if (pinned) return 1.0
  const halfLife = DECAY_HALF_LIFE_DAYS[type] ?? DEFAULT_HALF_LIFE_DAYS
  const effective = lastReaffirmedAt
    ? new Date(
        Math.max(
          new Date(updatedAt).getTime(),
          new Date(lastReaffirmedAt).getTime(),
        ),
      )
    : new Date(updatedAt)
  const ageDays = (Date.now() - effective.getTime()) / 86_400_000
  return Math.pow(0.5, ageDays / halfLife)
}
