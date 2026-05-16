// Centralized React Query keys so mutations can invalidate precisely.
export const queryKeys = {
  dashboard: (projectId: string) => ["dashboard", projectId] as const,
  memory: (projectId: string) => ["memory", projectId] as const,
  sources: (projectId: string) => ["sources", projectId] as const,
  activity: (scope: string) => ["activity", scope] as const,
  brief: (projectId: string) => ["brief", projectId] as const,
  settings: () => ["settings"] as const,
}
