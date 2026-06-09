import type { RelayContextPreview } from "../messaging/contracts"

export function contextPreviewHasItems(preview: RelayContextPreview): boolean {
  return countContextPreviewItems(preview) > 0
}

export function countContextPreviewItems(preview: RelayContextPreview): number {
  return (
    preview.decisions.length +
    preview.constraints.length +
    preview.tasks.length +
    preview.notes.length +
    preview.requirements.length
  )
}

function previewMemoryIds(preview: RelayContextPreview): Set<string> {
  const ids = new Set<string>()
  for (const item of preview.decisions) {
    if (item.memoryId) ids.add(item.memoryId)
  }
  for (const item of preview.constraints) {
    if (item.memoryId) ids.add(item.memoryId)
  }
  for (const item of preview.tasks) {
    if (item.memoryId) ids.add(item.memoryId)
  }
  for (const item of preview.notes) {
    ids.add(item.memoryId)
  }
  for (const item of preview.requirements) {
    ids.add(item.memoryId)
  }
  return ids
}

/**
 * Merge a background sync's preview into the current local preview.
 *
 * Rule: trust the server (next) as the authoritative base, but prepend any
 * local-only items (optimistic adds not yet confirmed by server) so they are
 * not lost between a write and the next successful refetch.
 *
 * When currentCount > nextCount the local state has deleted items the server
 * hasn't caught up with yet — return current to preserve those deletions.
 */
export function preferContextPreviewOnSync(
  current: RelayContextPreview,
  next: RelayContextPreview,
): RelayContextPreview {
  const currentCount = countContextPreviewItems(current)
  const nextCount = countContextPreviewItems(next)

  if (currentCount === nextCount) {
    return contextPreviewHasItems(next) ? next : current
  }

  // Local has more items: a delete is ahead of the server — keep local.
  if (currentCount > nextCount) {
    return current
  }

  // Server has more items or counts differ with cross-side changes.
  // Merge: server base + any current-only items (optimistic adds).
  const currentIds = previewMemoryIds(current)
  const nextIds = previewMemoryIds(next)
  const onlyInCurrent = new Set([...currentIds].filter((id) => !nextIds.has(id)))

  if (onlyInCurrent.size === 0) {
    // All local items already exist in server — take server directly.
    return next
  }

  return {
    decisions: [
      ...current.decisions.filter((i) => i.memoryId && onlyInCurrent.has(i.memoryId)),
      ...next.decisions,
    ],
    constraints: [
      ...current.constraints.filter((i) => i.memoryId && onlyInCurrent.has(i.memoryId)),
      ...next.constraints,
    ],
    tasks: [
      ...current.tasks.filter((i) => i.memoryId && onlyInCurrent.has(i.memoryId)),
      ...next.tasks,
    ],
    notes: [
      ...current.notes.filter((i) => onlyInCurrent.has(i.memoryId)),
      ...next.notes,
    ],
    requirements: [
      ...current.requirements.filter((i) => onlyInCurrent.has(i.memoryId)),
      ...next.requirements,
    ],
  }
}