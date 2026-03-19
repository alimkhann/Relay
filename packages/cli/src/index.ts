import { getStringFlag, hasFlag, parseArgs } from "./args"
import { runAuthCommand } from "./commands/auth"
import { runBriefCommand } from "./commands/brief"
import { runInstallCommand } from "./commands/install"
import { runProjectsCommand } from "./commands/projects"
import { runStatusCommand } from "./commands/status"
import { printHelp } from "./help"

async function main() {
  const parsed = parseArgs(process.argv.slice(2))

  if (!parsed.command || hasFlag(parsed.flags, "help", "h")) {
    printHelp()
    return
  }

  const apiBase = getStringFlag(parsed.flags, "api-base")

  switch (parsed.command) {
    case "install":
      await runInstallCommand({ apiBase })
      return
    case "auth":
      await runAuthCommand(parsed.subcommand, { apiBase })
      return
    case "brief":
      await runBriefCommand(
        [parsed.subcommand, ...parsed.positionals].filter(Boolean) as string[],
        {
          projectId: getStringFlag(parsed.flags, "project", "p"),
          kind: getStringFlag(parsed.flags, "kind"),
          targetProfileKey: getStringFlag(parsed.flags, "profile"),
          since: getStringFlag(parsed.flags, "since")
        }
      )
      return
    case "status":
      await runStatusCommand([parsed.subcommand, ...parsed.positionals].filter(Boolean) as string[], {
        projectId: getStringFlag(parsed.flags, "project", "p")
      })
      return
    case "projects":
      await runProjectsCommand(parsed.subcommand, parsed.positionals)
      return
    default:
      throw new Error(`Unknown command: ${parsed.command}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Relay CLI failed")
  process.exit(1)
})
