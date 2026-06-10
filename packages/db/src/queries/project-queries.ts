import { normalizeText, type ProjectSettingsRow, type ProjectSummaryDto } from "@relay/shared"

import type { RepositoryBundle } from "./repository-bundle"

const ROUTING_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "build",
  "chat",
  "continue",
  "current",
  "from",
  "have",
  "into",
  "just",
  "more",
  "next",
  "page",
  "project",
  "relay",
  "save",
  "that",
  "them",
  "then",
  "they",
  "this",
  "what",
  "when",
  "where",
  "with",
  "work",
  "your"
])

const MAX_ROUTING_KEYWORDS = 24

function extractRoutingKeywords(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const keywords: string[] = []

  for (const value of values) {
    const normalized = normalizeText(value ?? "").toLowerCase()
    if (!normalized) continue

    for (const token of normalized.split(/[^a-z0-9]+/g)) {
      if (token.length < 4 || ROUTING_STOP_WORDS.has(token) || seen.has(token)) {
        continue
      }

      seen.add(token)
      keywords.push(token)
      if (keywords.length >= MAX_ROUTING_KEYWORDS) {
        return keywords
      }
    }
  }

  return keywords
}

export async function getProjectSummaries(
  repositories: RepositoryBundle,
  ownerId: string,
  options: { includePersonal?: boolean } = {},
): Promise<ProjectSummaryDto[]> {
  const projects = await repositories.projects.listByOwner(ownerId, {
    includePersonal: options.includePersonal,
  })

  return Promise.all(
    projects.map(async (project) => {
      const [memoryCount, memorySamples, projectState, conversationCount, projectSettings] = await Promise.all([
        repositories.memory.countByProject(project.id),
        repositories.memory.listRoutingSamplesByProject(project.id, 3),
        repositories.projectState.getByProject(project.id),
        repositories.sessions.countDistinctConversations(project.id, { includeArchived: false }),
        repositories.projectSettings.getByProject(project.id)
      ])
      const settings = projectSettings?.settings as
        | ProjectSettingsRow["settings"]
        | undefined
      const routingKeywords = extractRoutingKeywords([
        project.name,
        project.slug,
        project.description,
        project.projectUrl,
        projectState?.projectOverview ?? null,
        projectState?.currentObjective ?? null,
        projectState?.recentProgress ?? null,
        ...(projectState?.decisions ?? []).slice(0, 3),
        ...(projectState?.constraints ?? []).slice(0, 3),
        ...(projectState?.openTasks ?? []).slice(0, 3),
        ...(projectState?.relevantTools ?? []).slice(0, 3),
        ...memorySamples.flatMap((item) => [item.title, item.content.slice(0, 240)])
      ])

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        projectUrl: project.projectUrl,
        memoryCount,
        sessionCount: conversationCount,
        routingContext: {
          hasMeaningfulContext: memoryCount > 0 || conversationCount > 0,
          keywords: routingKeywords
        },
        updatedAt: project.updatedAt,
        kind: project.kind,
        autoCapture: settings?.autoCapture,
        autoCapturePlatforms: settings?.autoCapturePlatforms,
        inlineChip: settings?.inlineChip,
        inlineChipPlatforms: settings?.inlineChipPlatforms
      }
    })
  )
}
