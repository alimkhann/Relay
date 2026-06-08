import {
  actionResultToMemoryMutations,
  applyMemoryMutationToDashboard,
  type AssistantActionResult,
  type MemoryItemDto,
  type MemoryMutationEnvelope,
  type ProjectDashboardDto,
} from "@relay/shared"

import type {
  RelayContextPreview,
  RelayContextPreviewItem,
  RelayContextNoteItem,
} from "../messaging/contracts"
import { buildDashboardContextPreview } from "../background/context-preview"

function clonePreview(preview: RelayContextPreview): RelayContextPreview {
  return {
    decisions: [...preview.decisions],
    constraints: [...preview.constraints],
    tasks: [...preview.tasks],
    notes: [...preview.notes],
    requirements: [...preview.requirements],
  }
}

function memoryToGovernedItem(item: MemoryItemDto): RelayContextPreviewItem {
  return {
    key: `manual:${item.id}`,
    text: item.content,
    source: "manual",
    memoryId: item.id,
    sourceSurface: item.sourceSurface ?? "ask_relay",
    capturedAt: item.capturedAt ?? item.updatedAt,
  }
}

function memoryToNoteItem(item: MemoryItemDto): RelayContextNoteItem {
  return {
    key: `note:${item.id}`,
    memoryId: item.id,
    text: item.content,
    sourceUrl: item.sourceUrl ?? null,
    hostname: null,
    sourceSurface: item.sourceSurface ?? "ask_relay",
    capturedAt: item.capturedAt ?? item.updatedAt,
    personalCategory:
      typeof item.metadata?.personalCategory === "string"
        ? item.metadata.personalCategory
        : null,
  }
}

function governedSectionForType(
  type: MemoryItemDto["type"],
): "decisions" | "constraints" | "tasks" | null {
  if (type === "decision") return "decisions"
  if (type === "constraint") return "constraints"
  if (type === "task") return "tasks"
  return null
}

function removeByMemoryId(preview: RelayContextPreview, memoryId: string): RelayContextPreview {
  const next = clonePreview(preview)
  const dropGoverned = (items: RelayContextPreviewItem[]) =>
    items.filter((item) => item.memoryId !== memoryId)
  const dropNotes = (items: RelayContextNoteItem[]) =>
    items.filter((item) => item.memoryId !== memoryId)

  next.decisions = dropGoverned(next.decisions)
  next.constraints = dropGoverned(next.constraints)
  next.tasks = dropGoverned(next.tasks)
  next.notes = dropNotes(next.notes)
  next.requirements = dropNotes(next.requirements)
  return next
}

function insertMemoryItem(preview: RelayContextPreview, item: MemoryItemDto): RelayContextPreview {
  const next = clonePreview(preview)
  if (item.type === "note") {
    const note = memoryToNoteItem(item)
    next.notes = [note, ...next.notes.filter((entry) => entry.memoryId !== item.id)]
    return next
  }
  if (item.type === "requirement") {
    const requirement = memoryToNoteItem(item)
    next.requirements = [
      requirement,
      ...next.requirements.filter((entry) => entry.memoryId !== item.id),
    ]
    return next
  }
  const section = governedSectionForType(item.type)
  if (section) {
    const entry = memoryToGovernedItem(item)
    next[section] = [entry, ...next[section].filter((entry) => entry.memoryId !== item.id)]
  }
  return next
}

export function applyMemoryMutationToContextPreview(
  preview: RelayContextPreview,
  mutation: MemoryMutationEnvelope,
): RelayContextPreview {
  let next = preview

  if (
    mutation.operation === "delete" ||
    (mutation.operation === "transfer" && mutation.before?.id)
  ) {
    const removedId = mutation.before?.id
    if (removedId) next = removeByMemoryId(next, removedId)
  }

  if (mutation.operation === "transfer" && mutation.after) {
    next = insertMemoryItem(next, mutation.after)
    return next
  }

  if (mutation.after && mutation.operation !== "delete") {
    if (mutation.before?.id) {
      next = removeByMemoryId(next, mutation.before.id)
    }
    next = insertMemoryItem(next, mutation.after)
  }

  return next
}

export function applyActionResultToContextPreview(
  preview: RelayContextPreview,
  result: AssistantActionResult,
  projectId?: string | null,
): RelayContextPreview {
  const mutations = actionResultToMemoryMutations(result, projectId)
  let next = preview
  for (const mutation of mutations) {
    if (
      !projectId ||
      mutation.sourceProjectId === projectId ||
      mutation.targetProjectId === projectId
    ) {
      next = applyMemoryMutationToContextPreview(next, mutation)
    }
  }
  return next
}

export function applyActionResultToDashboardCache(
  dashboard: ProjectDashboardDto,
  result: AssistantActionResult,
  projectId?: string | null,
): ProjectDashboardDto {
  const mutations = actionResultToMemoryMutations(result, projectId)
  let nextDashboard = dashboard
  for (const mutation of mutations) {
    nextDashboard = applyMemoryMutationToDashboard(nextDashboard, mutation)
  }
  return nextDashboard
}

export function contextPreviewFromDashboard(
  dashboard: ProjectDashboardDto | null | undefined,
): RelayContextPreview {
  return buildDashboardContextPreview(dashboard)
}