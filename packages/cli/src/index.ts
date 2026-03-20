import { getStringFlag, hasFlag, parseArgs } from "./args"
import { RelayCliAnalytics } from "./analytics"
import { runAuthCommand } from "./commands/auth"
import { runBriefCommand } from "./commands/brief"
import { runInstallCommand } from "./commands/install"
import { runProjectsCommand } from "./commands/projects"
import { runStatusCommand } from "./commands/status"
import { printHelp } from "./help"

async function main() {
  const analytics = new RelayCliAnalytics()
  const parsed = parseArgs(process.argv.slice(2))

  if (!parsed.command || hasFlag(parsed.flags, "help", "h")) {
    printHelp()
    await analytics.shutdown()
    return
  }

  const apiBase = getStringFlag(parsed.flags, "api-base")

  analytics.capture("cli_command_started", {
    command: parsed.command,
    subcommand: parsed.subcommand ?? null,
  })

  switch (parsed.command) {
    case "install":
      await runInstallCommand({ apiBase, analytics })
      await analytics.shutdown()
      return
    case "auth":
      await runAuthCommand(parsed.subcommand, { apiBase, analytics })
      await analytics.shutdown()
      return
    case "brief":
      await runBriefCommand(
        [parsed.subcommand, ...parsed.positionals].filter(Boolean) as string[],
        {
          analytics,
          projectId: getStringFlag(parsed.flags, "project", "p"),
          kind: getStringFlag(parsed.flags, "kind"),
          targetProfileKey: getStringFlag(parsed.flags, "profile"),
          since: getStringFlag(parsed.flags, "since")
        }
      )
      await analytics.shutdown()
      return
    case "status":
      await runStatusCommand([parsed.subcommand, ...parsed.positionals].filter(Boolean) as string[], {
        analytics,
        projectId: getStringFlag(parsed.flags, "project", "p")
      })
      await analytics.shutdown()
      return
    case "projects":
      await runProjectsCommand(parsed.subcommand, parsed.positionals, analytics)
      await analytics.shutdown()
      return
    default:
      throw new Error(`Unknown command: ${parsed.command}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Relay CLI failed")
  process.exit(1)
})
