import pc from "picocolors"

import type { RelayCliAnalytics } from "../analytics"
import { RelayApiClient, requireConfig, getProjectDashboard } from "@relay/cli-core"

export async function runStatusCommand(args: string[], options: { analytics?: RelayCliAnalytics; projectId?: string } = {}) {
  const config = await requireConfig()
  await options.analytics?.identify(config.apiBase, config.token)
  const projectId = options.projectId ?? args[0] ?? config.projectId
  if (!projectId) {
    throw new Error("No project selected. Run `relay projects switch <project>` or pass a project ID.")
  }

  const client = new RelayApiClient(config.apiBase, config.token)
  const data = await getProjectDashboard(client, projectId)
  options.analytics?.capture("cli_status_checked", {
    project_id: projectId,
    success: true,
  })
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
