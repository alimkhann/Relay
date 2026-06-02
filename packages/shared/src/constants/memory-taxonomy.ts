export const memoryStorageLayers = [
  "episode",
  "fact",
  "observation",
  "entity",
  "decision",
  "commitment",
  "task",
  "constraint",
  "preference",
  "artifact",
  "source",
  "summary",
  "brief",
] as const

export const memoryUserBuckets = [
  "note",
  "decision",
  "constraint",
  "requirement",
  "task",
  "artifact",
] as const

export const memoryInternalLayerByUserBucket = {
  note: "observation",
  decision: "decision",
  constraint: "constraint",
  requirement: "commitment",
  task: "task",
  artifact: "artifact",
} as const

// ── Personal memory categories (Folk-style) ──────────────────────────────────
// Personal memory items store as type 'note' with the real category in
// metadata.personalCategory. These are NOT the project memory_items.type enum.
// Single source of truth for the taxonomy + display (label + color) so the
// dashboard cards, graph, and extension panel all render them identically.
export const personalCategories = [
  "person",
  "company",
  "concept",
  "event",
  "meeting",
  "signals",
  "note",
] as const

export type PersonalCategory = (typeof personalCategories)[number]

export interface PersonalCategoryMeta {
  label: string
  /** Hex usable directly in both Tailwind arbitrary values and extension CSS. */
  color: string
}

// Colors mirror Folk's legend (person=red, company=coral, concept=blue,
// event=amber, meeting=teal, signals=violet, note=zinc).
export const PERSONAL_CATEGORY_META: Record<PersonalCategory, PersonalCategoryMeta> = {
  person: { label: "Person", color: "#ef4444" },
  company: { label: "Company", color: "#fb7185" },
  concept: { label: "Concept", color: "#3b82f6" },
  event: { label: "Event", color: "#f59e0b" },
  meeting: { label: "Meeting", color: "#14b8a6" },
  signals: { label: "Signals", color: "#8b5cf6" },
  note: { label: "Note", color: "#a1a1aa" },
}

export function isPersonalCategory(value: unknown): value is PersonalCategory {
  return typeof value === "string" && (personalCategories as readonly string[]).includes(value)
}

/** Read a personal-memory item's category from its metadata, if any. */
export function personalCategoryFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): PersonalCategory | null {
  const raw = metadata?.personalCategory
  return isPersonalCategory(raw) ? raw : null
}
