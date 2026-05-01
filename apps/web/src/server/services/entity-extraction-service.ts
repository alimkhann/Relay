import type { RepositoryBundle } from "@relay/db"
import { analyzeQueryCore } from "@relay/shared"

export async function extractAndLinkEntities(
  repositories: RepositoryBundle,
  projectId: string,
  memoryItemId: string,
  content: string,
  title?: string | null,
): Promise<void> {
  const text = title ? `${title} ${content}` : content
  const { extractedEntities } = analyzeQueryCore(text)

  for (const entityName of extractedEntities.slice(0, 10)) {
    try {
      const entity = await repositories.entities.findOrCreateByName(projectId, entityName)
      await repositories.entities.addMention(memoryItemId, entity.id, entityName)
    } catch {
      // fire-and-forget: table may not exist yet during migration rollout
    }
  }
}
