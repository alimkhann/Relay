import pc from "picocolors"

import type { RelayCliAnalytics } from "../analytics"
import {
  RelayApiClient,
  requireConfig,
  saveConfig,
  listProjects,
  success
} from "@relay/cli-core"

function printProjects(projects: Awaited<ReturnType<typeof listProjects>>, activeProjectId?: string) {
  if (projects.length === 0) {
    console.log("No Relay projects found.")
    return
  }

  for (const project of projects) {
    const marker = project.id === activeProjectId ? pc.green("*") : " "
    console.log(`${marker} ${project.name} ${pc.dim(`(${project.slug})`)}`)
    console.log(`  id: ${project.id}`)
    console.log(`  chats: ${project.sessionCount}  memory: ${project.memoryCount}`)
    if (project.description) {
      console.log(`  ${project.description}`)
    }
    console.log()
  }
}

export async function runProjectsCommand(subcommand: string | null, args: string[], analytics?: RelayCliAnalytics) {
  const config = await requireConfig()
  await analytics?.identify(config.apiBase, config.token)
  const client = new RelayApiClient(config.apiBase, config.token)

  switch (subcommand ?? "list") {
    case "list": {
      const projects = await listProjects(client)
      printProjects(projects, config.projectId)
      return
    }
    case "switch": {
      const target = args[0]
      if (!target) {
        throw new Error("Provide a project ID or slug. Example: relay projects switch my-project")
      }

      const projects = await listProjects(client)
      const match = projects.find((project) => project.id === target || project.slug === target)
      if (!match) {
        throw new Error(`Project not found: ${target}`)
      }

      await saveConfig({
        ...config,
        projectId: match.id,
        accessToken: undefined,
        refreshToken: undefined,
        accessTokenExpiresAt: undefined,
        refreshTokenExpiresAt: undefined,
      })
      analytics?.capture("cli_project_selected", {
        action: "switch",
        project_id: match.id,
      })
      success(`Active project set to ${match.name} ${pc.dim(`(${match.id})`)}`)
      console.log("Run `relay install` to approve a new scoped MCP token for this project.")
      return
    }
    default:
      throw new Error(`Unknown projects subcommand: ${subcommand}`)
  }
}
