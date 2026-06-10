import { unstable_cache } from "next/cache"

import type { MemoryItemRow } from "@relay/shared"

import { listActivityFeedForUser } from "@/server/services/activity-service"
import { listMemoryForExplainability } from "@/server/services/continuity-explainability-service"
import { getProjectDashboardForUser, listProjectsForUser } from "@/server/services/project-service"
import { buildProjectGraphSnapshot, type ProjectGraphRepositories } from "@/server/services/project-graph-service"
import { getProjectSourceDetail, listProjectSources } from "@/server/services/source-service"
import { createRepositoryBundle } from "@relay/db"
import type { ProjectGraphDensity } from "@relay/shared"

import { RELAY_CACHE_SCHEMA_VERSION, RELAY_SERVER_CACHE_SECONDS, relayCacheTags } from "./tags"

function cachedRead<T>(keyParts: string[], tags: string[], reader: () => Promise<T>) {
  return unstable_cache(reader, [RELAY_CACHE_SCHEMA_VERSION, ...keyParts], {
    revalidate: RELAY_SERVER_CACHE_SECONDS,
    tags: [RELAY_CACHE_SCHEMA_VERSION, ...tags],
  })()
}

export async function listCachedProjectsForUser(
  userId: string,
  options: { includePersonal?: boolean } = {},
) {
  const includePersonal = options.includePersonal ?? false
  return cachedRead(
    ["projects", userId, includePersonal ? "with-personal" : "no-personal"],
    [relayCacheTags.user(userId), relayCacheTags.userProjects(userId)],
    () => listProjectsForUser(userId, { includePersonal }),
  )
}

export async function getCachedProjectDashboardForUser(userId: string, projectId: string) {
  return cachedRead(
    ["project-dashboard", userId, projectId],
    [relayCacheTags.user(userId), relayCacheTags.project(projectId), relayCacheTags.dashboard(projectId)],
    () => getProjectDashboardForUser(userId, projectId),
  )
}

export async function listCachedProjectSources(userId: string, projectId: string) {
  return cachedRead(
    ["project-sources", userId, projectId],
    [relayCacheTags.user(userId), relayCacheTags.project(projectId), relayCacheTags.sources(projectId)],
    () => listProjectSources(userId, projectId),
  )
}

export async function getCachedProjectSourceDetail(
  userId: string,
  projectId: string,
  sourceId: string,
  options: { chunkId?: string | null; limit?: number | null } = {},
) {
  const normalizedOptions = {
    chunkId: options.chunkId ?? undefined,
    limit: options.limit ?? undefined,
  }
  return cachedRead(
    [
      "project-source-detail",
      userId,
      projectId,
      sourceId,
      normalizedOptions.chunkId ?? "all",
      String(normalizedOptions.limit ?? "default"),
    ],
    [
      relayCacheTags.user(userId),
      relayCacheTags.project(projectId),
      relayCacheTags.sources(projectId),
      relayCacheTags.sourceDetail(sourceId),
    ],
    () => getProjectSourceDetail(userId, projectId, sourceId, normalizedOptions),
  )
}

export interface CachedMemoryListOptions {
  archived?: boolean
  pinned?: boolean
  tag?: string
  types?: MemoryItemRow["type"][]
  limit?: number
  sort?: "updated_desc" | "created_desc"
  cursor?: { pinned: boolean; at: string; id: string } | null
}

export async function listCachedMemoryForExplainability(
  userId: string,
  projectId: string,
  options: CachedMemoryListOptions,
) {
  return cachedRead(
    ["project-memory", userId, projectId, JSON.stringify(options)],
    [relayCacheTags.user(userId), relayCacheTags.project(projectId), relayCacheTags.memory(projectId)],
    () => listMemoryForExplainability(userId, projectId, options),
  )
}

export async function getCachedProjectGraphForUser(
  userId: string,
  projectId: string,
  options: { density: ProjectGraphDensity; includeEvidence: boolean },
) {
  return cachedRead(
    ["project-graph", userId, projectId, options.density, options.includeEvidence ? "with-evidence" : "no-evidence"],
    [
      relayCacheTags.user(userId),
      relayCacheTags.project(projectId),
      relayCacheTags.memory(projectId),
      relayCacheTags.sources(projectId),
    ],
    () => buildProjectGraphSnapshot(createRepositoryBundle(userId) as ProjectGraphRepositories, projectId, options),
  )
}

export async function listCachedActivityFeedForUser(userId: string) {
  return cachedRead(
    ["activity", userId],
    [relayCacheTags.user(userId), relayCacheTags.activity(userId)],
    () => listActivityFeedForUser(userId),
  )
}
