interface RelayClientLike {
  get<T>(path: string): Promise<T>
}

export interface ProjectSummary {
  id: string
  name: string
  slug: string
  description: string | null
  memoryCount: number
  sessionCount: number
  routingContext: { hasMeaningfulContext: boolean; keywords: string[] } | null
  updatedAt: string
}

interface ListProjectsResponse {
  projects: ProjectSummary[]
}

interface ProjectDashboardResponse {
  project: {
    id: string
    name: string
    slug: string
    description: string | null
  }
  dashboard: {
    projectState: {
      currentObjective: string | null
      recentProgress: string | null
      decisions: string[]
      constraints: string[]
      openTasks: string[]
      relevantTools: string[]
      updatedAt: string
    } | null
    derivedProjectState: {
      currentObjective: string | null
      recentProgress: string | null
      decisions: string[]
      constraints: string[]
      openTasks: string[]
      relevantTools: string[]
      updatedAt: string
    } | null
    memory: Array<{ id: string }>
    stateStatus: {
      digestStatus?: string
      projectStateReady?: boolean
    }
  }
}

export async function listProjects(client: RelayClientLike): Promise<ProjectSummary[]> {
  const data = await client.get<ListProjectsResponse>("/api/projects")
  return data.projects
}

export async function getProjectDashboard(client: RelayClientLike, projectId: string): Promise<ProjectDashboardResponse> {
  return client.get<ProjectDashboardResponse>(`/api/projects/${projectId}`)
}
