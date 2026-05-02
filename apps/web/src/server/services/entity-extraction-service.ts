import type { RepositoryBundle } from "@relay/db"
import { extractEntities } from "@relay/shared"

export async function extractAndLinkEntities(
  repositories: RepositoryBundle,
  projectId: string,
  memoryItemId: string,
  content: string,
  title?: string | null,
): Promise<void> {
  const text = title ? `${title} ${content}` : content
  // Memory content often starts with a meaningful proper noun (e.g. "Stripe handles..."),
  // unlike user queries which usually start with a question word — so don't skip the first token.
  const entities = extractEntities(text, { skipFirstWord: false })

  for (const entityName of entities.slice(0, 10)) {
    try {
      const entity = await repositories.entities.findOrCreateByName(projectId, entityName)
      await repositories.entities.addMention(memoryItemId, entity.id, entityName)
    } catch {
      // fire-and-forget: table may not exist yet during migration rollout
    }
  }
}
