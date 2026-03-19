import pc from "picocolors"

import { RelayApiClient } from "../api-client"
import { requireConfig } from "../config"
import { getProjectDashboard } from "../project-api"

export async function runStatusCommand(args: string[], options: { projectId?: string } = {}) {
  const config = await requireConfig()
  const projectId = options.projectId ?? args[0] ?? config.projectId
  if (!projectId) {
    throw new Error("No project selected. Run `relay projects switch <project>` or pass a project ID.")
  }

  const client = new RelayApiClient(config.apiBase, config.token)
  const data = await getProjectDashboard(client, projectId)
  const state = data.dashboard.derivedProjectState ?? data.dashboard.projectState

  console.log(`${data.project.name} ${pc.dim(`(${data.project.slug})`)}`)
  console.log(`Project ID: ${data.project.id}`)
  console.log(`State ready: ${data.dashboard.stateStatus.projectStateReady ? "yes" : "no"}`)
  if (data.dashboard.stateStatus.digestStatus) {
    console.log(`Digest status: ${data.dashboard.stateStatus.digestStatus}`)
  }

  if (!state) {
    return
  }

  console.log()
  console.log(`Objective: ${state.currentObjective ?? "not set"}`)
  if (state.recentProgress) {
    console.log(`Recent progress: ${state.recentProgress}`)
  }
  console.log(`Open tasks: ${state.openTasks.length}`)
  console.log(`Decisions: ${state.decisions.length}`)
  console.log(`Constraints: ${state.constraints.length}`)
  console.log(`Memory items: ${data.dashboard.memory.length}`)
}
