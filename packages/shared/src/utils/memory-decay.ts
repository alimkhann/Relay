export const DECAY_HALF_LIFE_DAYS: Record<string, number> = {
  requirement: 120,
  decision: 90,
  constraint: 60,
  note: 30,
  task: 21,
  artifact: 14,
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
