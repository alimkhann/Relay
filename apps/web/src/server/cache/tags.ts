export const RELAY_CACHE_SCHEMA_VERSION = "v2"
export const RELAY_SERVER_CACHE_SECONDS = 300

function normalizeTagPart(value: string) {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 96)
}

export const relayCacheTags = {
  user: (userId: string) => `relay:user:${normalizeTagPart(userId)}`,
  userProjects: (userId: string) => `relay:user:${normalizeTagPart(userId)}:projects`,
  activity: (userId: string) => `relay:activity:${normalizeTagPart(userId)}`,
  project: (projectId: string) => `relay:project:${normalizeTagPart(projectId)}`,
  dashboard: (projectId: string) => `relay:dashboard:${normalizeTagPart(projectId)}`,
  sources: (projectId: string) => `relay:sources:${normalizeTagPart(projectId)}`,
  sourceDetail: (sourceId: string) => `relay:source:${normalizeTagPart(sourceId)}`,
  memory: (projectId: string) => `relay:memory:${normalizeTagPart(projectId)}`,
}
