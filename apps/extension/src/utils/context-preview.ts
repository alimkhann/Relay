import type { RelayContextPreview } from "../messaging/contracts"

export function contextPreviewHasItems(preview: RelayContextPreview): boolean {
  return (
    preview.decisions.length > 0 ||
    preview.constraints.length > 0 ||
    preview.tasks.length > 0 ||
    preview.notes.length > 0 ||
    preview.requirements.length > 0
  )
}