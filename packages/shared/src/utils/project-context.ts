import type { MemoryItemType, SourceSurface } from "../types/database"
import type { ProjectDashboardDto } from "../types/project"
import { normalizeText } from "./text"

export type ProjectContextSection = "decision" | "constraint" | "task"

export interface ProjectContextItem {
  key: string
  section: ProjectContextSection
  text: string
  source: "manual" | "derived"
  memoryId: string | null
  sourceSurface?: SourceSurface | null
  capturedAt?: string | null
}

const projectStateKeyBySection: Record<ProjectContextSection, "decisions" | "constraints" | "openTasks"> = {
  decision: "decisions",
  constraint: "constraints",
  task: "openTasks",
}

const memoryTypeBySection: Record<ProjectContextSection, MemoryItemType> = {
  decision: "decision",
  constraint: "constraint",
  task: "task",
}

function buildDerivedKey(section: ProjectContextSection, text: string) {
  const normalized = normalizeText(text).toLowerCase() || text.toLowerCase()
  return `derived:${section}:${normalized}`
}

/**
 * Derived governed lines are aggregated from session digests and carry no single
 * source row. Rather than label them a bare "Derived", surface the project's
 * predominant capture platform (mode of the memory items' real source surfaces)
 * so the user sees where the project's context comes from.
 */
function predominantSourceSurface(dashboard: ProjectDashboardDto): SourceSurface | null {
  const counts = new Map<SourceSurface, number>()
  for (const item of dashboard.memory) {
    const surface = item.sourceSurface
    if (!surface || surface === "manual") continue
    counts.set(surface, (counts.get(surface) ?? 0) + 1)
  }
  let best: SourceSurface | null = null
  let bestCount = 0
  for (const [surface, count] of counts) {
    if (count > bestCount) {
      best = surface
      bestCount = count
    }
  }
  return best
}

export function buildProjectContextItems(
  dashboard: ProjectDashboardDto,
  section: ProjectContextSection,
): ProjectContextItem[] {
  const derivedSurface = predominantSourceSurface(dashboard)
  const effectiveItems = dashboard.projectState?.[projectStateKeyBySection[section]] ?? []
  const manualItems = dashboard.memory.filter(
    (item) => item.type === memoryTypeBySection[section],
  )

  return effectiveItems
    .map((text) => {
      const normalizedText = normalizeText(text).toLowerCase()
      const manualMatch = manualItems.find(
        (item) => normalizeText(item.content).toLowerCase() === normalizedText,
      )

      if (manualMatch) {
        return {
          key: `manual:${manualMatch.id}`,
          section,
          text,
          source: "manual" as const,
          memoryId: manualMatch.id,
          sourceSurface: manualMatch.sourceSurface,
          capturedAt: manualMatch.capturedAt,
        }
      }

      return {
        key: buildDerivedKey(section, text),
        section,
        text,
        source: "derived" as const,
        memoryId: null,
        // Surface the project's predominant capture platform instead of a bare
        // "Derived" (null → the UI falls back to "Derived").
        sourceSurface: derivedSurface,
        // Derived items have no capture event — stamp the time the project
        // state was last rederived so the UI can show a relative time.
        capturedAt: dashboard.projectState?.updatedAt ?? null,
      }
    })
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) => normalizeText(candidate.text).toLowerCase() === normalizeText(item.text).toLowerCase(),
        ) === index,
    )
}

export function buildProjectContextPreview(dashboard: ProjectDashboardDto) {
  return {
    decisions: buildProjectContextItems(dashboard, "decision"),
    constraints: buildProjectContextItems(dashboard, "constraint"),
    tasks: buildProjectContextItems(dashboard, "task"),
  }
}

export function getProjectContextCounts(dashboard: ProjectDashboardDto) {
  const preview = buildProjectContextPreview(dashboard)
  const decisions = preview.decisions.length
  const constraints = preview.constraints.length
  const tasks = preview.tasks.length
  const notes = dashboard.memory.filter((i) => i.type === "note").length
  const requirements = dashboard.memory.filter((i) => i.type === "requirement").length
  const artifacts = dashboard.memory.filter((i) => i.type === "artifact").length

  return {
    all: decisions + constraints + tasks + notes + requirements + artifacts,
    decisions,
    constraints,
    tasks,
    notes,
    requirements,
    artifacts,
  }
}
