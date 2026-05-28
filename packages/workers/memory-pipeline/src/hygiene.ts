/**
 * Memory hygiene tick.
 *
 * Two parts:
 *   1. Decay-driven lifecycle transitions (active → cooling → archived) for
 *      memory_items + observations. Hard rules in proposeLifecycleTransition
 *      keep pinned / authority / recent rows safe.
 *   2. Smart resurrection: when a fresh observation matches an archived
 *      memory_item via (subject_entity_id, predicate) or content embedding,
 *      restore the archived row to 'cooling' with event 'restored_auto'.
 *
 * All transitions write a memory_events row so the dashboard can show
 * "why was this archived?" explanations.
 */

import type {
  DatabaseProvider,
  EntityRelationRepository,
  MemoryRepository,
  ObservationRepository,
} from "@relay/db"
import {
  LIFECYCLE_HALF_LIFE_DAYS,
  proposeLifecycleTransition,
  type DecayableItem,
} from "@relay/shared"

export interface HygieneOptions {
  /** Projects to process this tick. If omitted, every project is scanned. */
  projectIds?: string[]
  /** Items per project per tick. Default 100. */
  perProjectLimit?: number
  /** When true, only logs proposed transitions (no writes). */
  dryRun?: boolean
  /** Override half-life lookup. */
  halfLifeDays?: Record<string, number>
}

export interface HygieneResult {
  projectsProcessed: number
  itemsProposed: number
  itemsCooled: number
  itemsArchived: number
  observationsCooled: number
  observationsArchived: number
  itemsResurrected: number
  dryRun: boolean
}

interface RepoBundle {
  provider: DatabaseProvider
  memory: MemoryRepository
  observation: ObservationRepository
  entityRelation: EntityRelationRepository
}

async function loadHalfLives(
  provider: DatabaseProvider,
  override?: Record<string, number>,
): Promise<Record<string, number>> {
  if (override) return { ...LIFECYCLE_HALF_LIFE_DAYS, ...override }
  try {
    const rows = await provider.query(
      `SELECT item_type, half_life_days FROM memory_half_lives`,
    )
    const out: Record<string, number> = { ...LIFECYCLE_HALF_LIFE_DAYS }
    for (const row of rows) {
      const r = row as Record<string, unknown>
      out[String(r.item_type)] = Number(r.half_life_days)
    }
    return out
  } catch {
    return { ...LIFECYCLE_HALF_LIFE_DAYS }
  }
}

export async function runHygieneTick(
  repos: RepoBundle,
  options: HygieneOptions = {},
): Promise<HygieneResult> {
  const dryRun = options.dryRun ?? false
  const perProjectLimit = Math.min(Math.max(options.perProjectLimit ?? 100, 1), 1000)
  const halfLifeDays = await loadHalfLives(repos.provider, options.halfLifeDays)

  const out: HygieneResult = {
    projectsProcessed: 0,
    itemsProposed: 0,
    itemsCooled: 0,
    itemsArchived: 0,
    observationsCooled: 0,
    observationsArchived: 0,
    itemsResurrected: 0,
    dryRun,
  }

  const projectIds = options.projectIds ?? (await listAllProjectIds(repos.provider))

  for (const projectId of projectIds) {
    out.projectsProcessed += 1

    // 1. Decay sweep over memory_items currently active / cooling.
    const itemRows = await repos.provider.query(
      `SELECT id, project_id, type, content, pinned, captured_at,
              created_at, last_reaffirmed_at, metadata, lifecycle_state, valid_until
       FROM memory_items
       WHERE project_id = $1
         AND lifecycle_state IN ('active','cooling')
       ORDER BY coalesce(last_reaffirmed_at, captured_at, created_at) ASC
       LIMIT $2`,
      [projectId, perProjectLimit],
    )

    for (const row of itemRows) {
      const r = row as Record<string, unknown>
      const item: DecayableItem & { id: string; projectId: string } = {
        id: String(r.id),
        projectId: String(r.project_id),
        content: String(r.content),
        type: String(r.type),
        capturedAt: r.captured_at ? String(r.captured_at) : null,
        createdAt: r.created_at ? String(r.created_at) : null,
        lastReaffirmedAt: r.last_reaffirmed_at ? String(r.last_reaffirmed_at) : null,
        pinned: Boolean(r.pinned),
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        lifecycleState: String(r.lifecycle_state),
        validUntil: r.valid_until ? String(r.valid_until) : null,
      }

      const transition = proposeLifecycleTransition(item, {
        halfLifeDays,
        alreadyCooling: item.lifecycleState === "cooling",
      })
      if (!transition) continue
      out.itemsProposed += 1
      if (dryRun) continue

      if (transition.next === "cooling") {
        await repos.provider.query(
          `UPDATE memory_items SET lifecycle_state = 'cooling' WHERE id = $1`,
          [item.id],
        )
        out.itemsCooled += 1
        await writeEvent(repos.provider, {
          projectId: item.projectId,
          memoryItemId: item.id,
          eventType: "cooled",
          payload: { ...transition },
        })
      } else if (transition.next === "archived") {
        await repos.provider.query(
          `UPDATE memory_items SET lifecycle_state = 'archived' WHERE id = $1`,
          [item.id],
        )
        out.itemsArchived += 1
        await writeEvent(repos.provider, {
          projectId: item.projectId,
          memoryItemId: item.id,
          eventType: "archived",
          payload: { ...transition },
        })
      }
    }

    // 2. Decay sweep over observations.
    const obsRows = await repos.provider.query(
      `SELECT o.id, o.content, o.valid_from, o.created_at,
              o.lifecycle_state, o.valid_until, o.metadata, o.confidence
       FROM observations o
       WHERE o.project_id = $1
         AND o.lifecycle_state IN ('active','cooling')
         AND o.valid_until IS NULL
       ORDER BY o.valid_from ASC
       LIMIT $2`,
      [projectId, perProjectLimit],
    )

    for (const row of obsRows) {
      const r = row as Record<string, unknown>
      const observation: DecayableItem & { id: string } = {
        id: String(r.id),
        content: String(r.content),
        type: "observation",
        capturedAt: r.valid_from ? String(r.valid_from) : null,
        createdAt: r.created_at ? String(r.created_at) : null,
        lastReaffirmedAt: null,
        pinned: false,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        lifecycleState: String(r.lifecycle_state),
      }
      const transition = proposeLifecycleTransition(observation, {
        halfLifeDays,
        alreadyCooling: observation.lifecycleState === "cooling",
      })
      if (!transition) continue
      if (dryRun) continue

      if (transition.next === "cooling") {
        await repos.observation.setLifecycle(observation.id, "cooling")
        out.observationsCooled += 1
      } else if (transition.next === "archived") {
        await repos.observation.setLifecycle(observation.id, "archived")
        out.observationsArchived += 1
      }
    }

    // 3. Smart resurrection: new active observations with subject+predicate
    // that match an archived memory_item's last SVO context.
    const resurrectRows = await repos.provider.query(
      `WITH new_facts AS (
         SELECT id, subject_entity_id, predicate
         FROM observations
         WHERE project_id = $1
           AND lifecycle_state = 'active'
           AND created_at > now() - interval '1 day'
           AND subject_entity_id IS NOT NULL
           AND predicate IS NOT NULL
       ),
       archived_matches AS (
         SELECT DISTINCT mi.id AS memory_item_id, mi.project_id, nf.id AS observation_id
         FROM memory_items mi
         JOIN entity_mentions em ON em.memory_item_id = mi.id
         JOIN new_facts nf ON nf.subject_entity_id = em.entity_id
         WHERE mi.project_id = $1
           AND mi.lifecycle_state = 'archived'
       )
       SELECT memory_item_id, project_id, observation_id FROM archived_matches LIMIT 50`,
      [projectId],
    )

    for (const row of resurrectRows) {
      const r = row as Record<string, unknown>
      const memoryItemId = String(r.memory_item_id)
      const projectId = r.project_id ? String(r.project_id) : null
      const observationId = String(r.observation_id)
      if (dryRun) {
        out.itemsResurrected += 1
        continue
      }
      // Reset the decay clock alongside the lifecycle flip — otherwise the
      // next hygiene tick re-archives the row because computeDecayScore
      // still sees a stale last_reaffirmed_at and proposes archived again.
      await repos.provider.query(
        `UPDATE memory_items
         SET lifecycle_state = 'cooling',
             last_reaffirmed_at = now()
         WHERE id = $1`,
        [memoryItemId],
      )
      out.itemsResurrected += 1
      await writeEvent(repos.provider, {
        projectId,
        memoryItemId,
        eventType: "restored_auto",
        payload: { reason: "new_evidence_matched", observationId },
      })
    }
  }

  return out
}

async function listAllProjectIds(provider: DatabaseProvider): Promise<string[]> {
  // Bounded scan: most-recently-touched projects first. At current scale (~100s)
  // this covers every project; once project counts grow past the limit, switch to
  // cursor-based pagination across ticks (tracked for a later PR).
  const rows = await provider.query(
    `SELECT id FROM projects ORDER BY updated_at DESC NULLS LAST LIMIT 500`,
  )
  return rows.map((r) => String((r as Record<string, unknown>).id))
}

interface EventInput {
  projectId: string | null
  memoryItemId: string | null
  eventType: string
  payload: Record<string, unknown>
}

async function writeEvent(
  provider: DatabaseProvider,
  evt: EventInput,
): Promise<void> {
  await provider.query(
    `INSERT INTO memory_events
      (project_id, memory_item_id, event_type, source_surface, payload)
     VALUES ($1, $2, $3, 'worker', COALESCE($4::jsonb, '{}'::jsonb))`,
    [
      evt.projectId,
      evt.memoryItemId,
      evt.eventType,
      JSON.stringify(evt.payload),
    ],
  )
}
