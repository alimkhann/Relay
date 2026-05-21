/**
 * Decay scoring + lifecycle transition proposals for the memory hygiene
 * worker. Pure functions (no DB) — the worker passes in the relevant rows
 * and the half-life map.
 *
 * Decay multiplier formula:   exp(-age_days / half_life_days)
 *
 * Age is computed from coalesce(last_reaffirmed_at, captured_at, created_at).
 * Pinned items skip decay entirely (multiplier stays at 1.0).
 *
 * Half-life defaults (database authoritative; this is fallback):
 *   decision    = 180 days
 *   constraint  = 120 days
 *   requirement =  90 days
 *   task        =  14 days
 *   note        =  60 days
 *   artifact    = 365 days
 *   observation =  45 days
 */

import { computeMemoryTruthScore, type MemoryItemForConflictResolution } from "./merge-governed"
import { DECAY_HALF_LIFE_DAYS } from "./memory-decay"

/**
 * Reuse the shared half-life map from `memory-decay.ts`. Re-exported here
 * under a more descriptive name for the hygiene worker. Override per-tick
 * via the worker's options.halfLifeDays.
 */
export const LIFECYCLE_HALF_LIFE_DAYS: Record<string, number> = DECAY_HALF_LIFE_DAYS

/** Internal alias kept for the hygiene worker; not re-exported at the package root. */
const _LIFECYCLE_HALF_LIFE_DAYS_INTERNAL: Record<string, number> = LIFECYCLE_HALF_LIFE_DAYS
export { _LIFECYCLE_HALF_LIFE_DAYS_INTERNAL as LIFECYCLE_HALF_LIFE_DAYS_MAP }

export const DECAY_COOL_THRESHOLD = 0.2
/** Already exported by memory-decay.ts at the same numeric value; we use that as the source of truth in callers. */
export const LIFECYCLE_DECAY_ARCHIVE_THRESHOLD = 0.05

/** Truth score below this + low decay => candidate for cooling. */
export const TRUTH_COOL_THRESHOLD = 30
/** Truth score below this + low decay => candidate for archive. */
export const TRUTH_ARCHIVE_THRESHOLD = 20

/** Recent-write protection window (days) — never propose transitions on these. */
export const RECENT_WRITE_PROTECTION_DAYS = 7

export interface DecayableItem extends MemoryItemForConflictResolution {
  lastReaffirmedAt?: string | null
  createdAt?: string | null
  validUntil?: string | null
  lifecycleState?: string | null
}

/** ms in one day. */
const DAY_MS = 24 * 60 * 60 * 1000

export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from
  const b = typeof to === "string" ? new Date(to) : to
  if (Number.isNaN(a.getTime())) return 0
  return Math.max(0, (b.getTime() - a.getTime()) / DAY_MS)
}

function resolveAnchorDate(item: DecayableItem): Date | null {
  const candidate =
    item.lastReaffirmedAt ?? item.capturedAt ?? item.createdAt ?? null
  if (!candidate) return null
  const date = new Date(candidate)
  return Number.isNaN(date.getTime()) ? null : date
}

export function computeDecayMultiplier(
  item: DecayableItem,
  halfLifeDays: Record<string, number> = LIFECYCLE_HALF_LIFE_DAYS,
  now: Date = new Date(),
): number {
  if (item.pinned) return 1.0
  const anchor = resolveAnchorDate(item)
  if (!anchor) return 1.0
  const halfLife = halfLifeDays[item.type] ?? halfLifeDays.note ?? 60
  if (halfLife <= 0) return 1.0
  const age = daysBetween(anchor, now)
  if (age <= 0) return 1.0
  // exp(-age / halfLife) — never below floor so search isn't crushed entirely.
  const multiplier = Math.exp(-age / halfLife)
  return Math.max(multiplier, 0.001)
}

export interface LifecycleTransition {
  next: "active" | "cooling" | "archived"
  reason: string
  decayMultiplier: number
  truthScore: number
}

/**
 * Decide whether to propose a lifecycle transition for `item`.
 *
 * Hard rules (never auto-archive):
 *   - pinned
 *   - authority in ('human_explicit','artifact_verified')
 *   - written or reaffirmed in last RECENT_WRITE_PROTECTION_DAYS days
 *   - already in non-active state (caller handles those separately)
 */
export function proposeLifecycleTransition(
  item: DecayableItem,
  options: {
    halfLifeDays?: Record<string, number>
    now?: Date
    /** If true the proposed transition is for an item already in 'cooling'. */
    alreadyCooling?: boolean
  } = {},
): LifecycleTransition | null {
  const now = options.now ?? new Date()
  const halfLifeDays = options.halfLifeDays ?? LIFECYCLE_HALF_LIFE_DAYS

  if (item.pinned) return null
  const authority = (item.metadata?.authority as string | undefined) ?? null
  if (authority === "human_explicit" || authority === "artifact_verified") {
    return null
  }
  const anchor = resolveAnchorDate(item)
  if (anchor) {
    const ageDays = daysBetween(anchor, now)
    if (ageDays < RECENT_WRITE_PROTECTION_DAYS) return null
  }

  const decay = computeDecayMultiplier(item, halfLifeDays, now)
  const truth = computeMemoryTruthScore(item)

  if (decay < LIFECYCLE_DECAY_ARCHIVE_THRESHOLD && truth < TRUTH_ARCHIVE_THRESHOLD) {
    return {
      next: "archived",
      reason: "decay_below_archive_threshold",
      decayMultiplier: decay,
      truthScore: truth,
    }
  }
  if (decay < DECAY_COOL_THRESHOLD && truth < TRUTH_COOL_THRESHOLD) {
    // Already cooling? Don't re-propose 'cooling'. Wait for the archive
    // threshold (or external supersession) before further action.
    if (options.alreadyCooling) return null
    return {
      next: "cooling",
      reason: "decay_below_cool_threshold",
      decayMultiplier: decay,
      truthScore: truth,
    }
  }

  return null
}
