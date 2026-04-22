import { getStringFlag, hasFlag, parseArgs } from "./args"
import { RelayCliAnalytics } from "./analytics"
import { runAuthCommand } from "./commands/auth"
import { runBriefCommand } from "./commands/brief"
import { runInstallCommand } from "./commands/install"
import { runProjectsCommand } from "./commands/projects"
import { runStatusCommand } from "./commands/status"
import { runUninstallCommand } from "./commands/uninstall"
import { printHelp } from "./help"

const analytics = new RelayCliAnalytics()

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  const openBrowser = !hasFlag(parsed.flags, "no-browser")
  const startedAt = Date.now()

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

  try {
    switch (parsed.command) {
      case "install":
        await runInstallCommand({ apiBase, analytics, openBrowser })
        break
      case "auth":
        await runAuthCommand(parsed.subcommand, { apiBase, analytics, openBrowser })
        break
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
        break
      case "status":
        await runStatusCommand([parsed.subcommand, ...parsed.positionals].filter(Boolean) as string[], {
          analytics,
          projectId: getStringFlag(parsed.flags, "project", "p")
        })
        break
      case "projects":
        await runProjectsCommand(parsed.subcommand, parsed.positionals, analytics)
        break
      case "uninstall":
        await runUninstallCommand({ analytics })
        break
      default:
        throw new Error(`Unknown command: ${parsed.command}`)
    }

    analytics.capture("cli_command_completed", {
      command: parsed.command,
      subcommand: parsed.subcommand ?? null,
      duration_ms: Date.now() - startedAt,
      open_browser: openBrowser,
      success: true,
    })
    await analytics.shutdown()
    return
  } catch (error) {
    analytics.capture("cli_command_failed", {
      command: parsed.command,
      subcommand: parsed.subcommand ?? null,
      duration_ms: Date.now() - startedAt,
      open_browser: openBrowser,
      success: false,
    })
    throw error
  }
}

main().catch(async (error) => {
  analytics.captureException(error, {
    command: process.argv[2] ?? "unknown",
    subcommand: process.argv[3] ?? null,
  })
  await analytics.shutdown()
  console.error(error instanceof Error ? error.message : "Relay CLI failed")
  process.exit(1)
})
