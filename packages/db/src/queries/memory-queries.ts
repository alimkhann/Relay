import type { MemoryItemRow } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"

export async function getRankedMemory(repositories: RepositoryBundle, projectId: string): Promise<MemoryItemRow[]> {
  const items = await repositories.memory.listByProject(projectId)
  const rank = new Map([
    ["decision", 0],
    ["constraint", 1],
    ["requirement", 2],
    ["task", 3],
    ["note", 4],
    ["artifact", 5]
  ])

  return items.sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned)
    return (rank.get(a.type) ?? 10) - (rank.get(b.type) ?? 10)
  })
}
