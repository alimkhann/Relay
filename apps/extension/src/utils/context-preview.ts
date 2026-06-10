import type {
  RelayContextNoteItem,
  RelayContextPreview,
  RelayContextPreviewItem,
} from "../messaging/contracts"

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

function previewItemKey(
  item: RelayContextPreviewItem | RelayContextNoteItem,
): string {
  if ("memoryId" in item && item.memoryId) return `id:${item.memoryId}`
  if (item.key) return `key:${item.key}`
  if ("text" in item && item.text) return `text:${item.text}`
  return `local:${JSON.stringify(item)}`
}

function previewItemKeys(preview: RelayContextPreview): Set<string> {
  const keys = new Set<string>()
  for (const item of [
    ...preview.decisions,
    ...preview.constraints,
    ...preview.tasks,
    ...preview.notes,
    ...preview.requirements,
  ]) {
    keys.add(previewItemKey(item))
  }
  return keys
}

function previewsEqual(current: RelayContextPreview, next: RelayContextPreview): boolean {
  const currentKeys = previewItemKeys(current)
  const nextKeys = previewItemKeys(next)
  if (currentKeys.size !== nextKeys.size) return false
  for (const key of currentKeys) {
    if (!nextKeys.has(key)) return false
  }
  return true
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
    if (previewsEqual(current, next)) {
      return contextPreviewHasItems(next) ? next : current
    }
  }

  // Local has more items: a delete is ahead of the server — keep local.
  if (currentCount > nextCount) {
    return current
  }

  // Server payload is a strict superset — stale sync reintroduced locally deleted rows.
  if (currentCount < nextCount) {
    const currentIds = new Set(
      [
        ...current.decisions,
        ...current.constraints,
        ...current.tasks,
        ...current.notes,
        ...current.requirements,
      ]
        .map((item) => ("memoryId" in item ? item.memoryId : null))
        .filter((id): id is string => Boolean(id)),
    )
    const nextIds = new Set(
      [
        ...next.decisions,
        ...next.constraints,
        ...next.tasks,
        ...next.notes,
        ...next.requirements,
      ]
        .map((item) => ("memoryId" in item ? item.memoryId : null))
        .filter((id): id is string => Boolean(id)),
    )
    if (
      currentIds.size > 0 &&
      [...currentIds].every((id) => nextIds.has(id)) &&
      nextIds.size > currentIds.size
    ) {
      return current
    }
  }

  // Server has more items or counts differ with cross-side changes.
  // Merge: server base + any current-only items (optimistic adds).
  const currentKeys = previewItemKeys(current)
  const nextKeys = previewItemKeys(next)
  const onlyInCurrent = new Set([...currentKeys].filter((key) => !nextKeys.has(key)))

  if (onlyInCurrent.size === 0) {
    return next
  }

  const keepLocal = (item: RelayContextPreviewItem | RelayContextNoteItem) =>
    onlyInCurrent.has(previewItemKey(item))

  return {
    decisions: [
      ...current.decisions.filter(keepLocal),
      ...next.decisions,
    ],
    constraints: [
      ...current.constraints.filter(keepLocal),
      ...next.constraints,
    ],
    tasks: [
      ...current.tasks.filter(keepLocal),
      ...next.tasks,
    ],
    notes: [
      ...current.notes.filter(keepLocal),
      ...next.notes,
    ],
    requirements: [
      ...current.requirements.filter(keepLocal),
      ...next.requirements,
    ],
  }
}