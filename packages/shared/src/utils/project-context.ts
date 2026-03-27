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

export function buildProjectContextItems(
  dashboard: ProjectDashboardDto,
  section: ProjectContextSection,
): ProjectContextItem[] {
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
        sourceSurface: null,
        capturedAt: null,
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

  return {
    all: decisions + constraints + tasks,
    decisions,
    constraints,
    tasks,
  }
}
