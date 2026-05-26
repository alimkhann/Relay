import { revalidateTag } from "next/cache"

import { relayCacheTags } from "./tags"

function expireTag(tag: string) {
  try {
    revalidateTag(tag, "max")
  } catch (error) {
    if (process.env["VITEST"]) return
    throw error
  }
}

export function invalidateProjectCache(userId: string, projectId: string) {
  expireTag(relayCacheTags.user(userId))
  expireTag(relayCacheTags.activity(userId))
  expireTag(relayCacheTags.project(projectId))
  expireTag(relayCacheTags.dashboard(projectId))
  expireTag(relayCacheTags.sources(projectId))
  expireTag(relayCacheTags.memory(projectId))
}

export function invalidateProjectSourceCache(userId: string, projectId: string, sourceId?: string | null) {
  invalidateProjectCache(userId, projectId)
  if (sourceId) {
    expireTag(relayCacheTags.sourceDetail(sourceId))
  }
}

export function invalidateUserProjectsCache(userId: string) {
  expireTag(relayCacheTags.user(userId))
  expireTag(relayCacheTags.userProjects(userId))
  expireTag(relayCacheTags.activity(userId))
}
