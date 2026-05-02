import type { MemoryItemDto } from "@relay/shared"

export interface NoteDto {
  id: string
  title: string | null
  content: string
  sourceUrl: string | null
  hostname: string | null
  capturedAt: string
  updatedAt: string
}

function parseHostname(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

export function toNoteDto(item: MemoryItemDto): NoteDto {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    sourceUrl: item.sourceUrl,
    hostname: parseHostname(item.sourceUrl),
    capturedAt: item.capturedAt ?? item.updatedAt,
    updatedAt: item.updatedAt,
  }
}

export function selectPinnedNotes(memory: MemoryItemDto[], limit?: number): NoteDto[] {
  const notes = memory
    .filter((item) => item.type === "note" && item.pinned)
    .sort((a, b) => {
      const aTime = a.capturedAt ?? a.updatedAt
      const bTime = b.capturedAt ?? b.updatedAt
      return bTime.localeCompare(aTime)
    })
    .map(toNoteDto)

  return typeof limit === "number" ? notes.slice(0, limit) : notes
}
