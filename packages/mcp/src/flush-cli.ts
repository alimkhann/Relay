#!/usr/bin/env node
/**
 * relay-flush — autonomous save hook entry point.
 *
 * Invoked from Claude Code PreCompact, SessionEnd, and Stop hooks (and from
 * any equivalent client-side hook) to flush all open Relay work sessions
 * for the configured project through the digest + reconcile pipeline.
 *
 * Usage:
 *   relay-flush                  # sweep all open sessions (reason=explicit)
 *   relay-flush precompact       # reason label for telemetry
 *   relay-flush --idle=5m        # only sessions idle >5 minutes
 *   relay-flush --project=<uuid> # override configured project id
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

import { loadConfig } from "./config.js"
import { RelayClient } from "./client.js"

type FlushReason = "precompact" | "session_end" | "stop" | "explicit"

interface ParsedArgs {
  reason: FlushReason
  idleMs: number
  projectId?: string
  quiet: boolean
}

function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(value.trim())
  if (!match) return 0
  const amount = Number(match[1])
  switch (match[2] ?? "ms") {
    case "ms":
      return amount
    case "s":
      return amount * 1000
    case "m":
      return amount * 60_000
    case "h":
      return amount * 3_600_000
    default:
      return amount
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { reason: "explicit", idleMs: 0, quiet: false }
  for (const raw of argv) {
    if (raw === "precompact" || raw === "session_end" || raw === "stop" || raw === "explicit") {
      args.reason = raw
      continue
    }
    if (raw === "--quiet" || raw === "-q") {
      args.quiet = true
      continue
    }
    if (raw.startsWith("--idle=")) {
      args.idleMs = parseDuration(raw.slice("--idle=".length))
      continue
    }
    if (raw.startsWith("--project=")) {
      args.projectId = raw.slice("--project=".length)
      continue
    }
  }
  return args
}

interface HookEntry {
  type: string
  command: string
}

interface HookMatcher {
  matcher: string
  hooks: HookEntry[]
}

interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>
  [key: string]: unknown
}

const RELAY_MARK_COMMAND_PREFIX = "relay-flush"

async function loadSkillHooks(): Promise<Record<string, HookMatcher[]>> {
  const skillPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "skills",
    "relay-autosave",
    "hooks.json",
  )
  try {
    const raw = await readFile(skillPath, "utf-8")
    const parsed = JSON.parse(raw) as { hooks?: Record<string, HookMatcher[]> }
    return parsed.hooks ?? {}
  } catch {
    // Fallback: ship the canonical hook set inline so the CLI works even
    // when the packaged skills/ directory isn't adjacent to dist/.
    return {
      PreCompact: [
        { matcher: "*", hooks: [{ type: "command", command: "relay-flush precompact --quiet" }] },
      ],
      SessionEnd: [
        { matcher: "*", hooks: [{ type: "command", command: "relay-flush session_end --quiet" }] },
      ],
      Stop: [
        { matcher: "*", hooks: [{ type: "command", command: "relay-flush stop --quiet" }] },
      ],
    }
  }
}

function mergeHookEvent(existing: HookMatcher[] | undefined, incoming: HookMatcher[]): HookMatcher[] {
  const merged: HookMatcher[] = [...(existing ?? [])]
  for (const entry of incoming) {
    const idx = merged.findIndex((m) => m.matcher === entry.matcher)
    if (idx === -1) {
      merged.push(entry)
      continue
    }
    const current = merged[idx]!
    const filteredHooks = current.hooks.filter(
      (h) => !(h.type === "command" && h.command.startsWith(RELAY_MARK_COMMAND_PREFIX)),
    )
    merged[idx] = {
      matcher: current.matcher,
      hooks: [...filteredHooks, ...entry.hooks],
    }
  }
  return merged
}

async function installClaudeCodeSkill(quiet: boolean) {
  const settingsPath = join(homedir(), ".claude", "settings.json")
  await mkdir(dirname(settingsPath), { recursive: true })

  let settings: ClaudeSettings = {}
  try {
    const raw = await readFile(settingsPath, "utf-8")
    settings = JSON.parse(raw) as ClaudeSettings
  } catch {
    // File doesn't exist yet or isn't JSON — we'll create a fresh one.
  }

  const incoming = await loadSkillHooks()
  const nextHooks: Record<string, HookMatcher[]> = { ...(settings.hooks ?? {}) }
  for (const [event, matchers] of Object.entries(incoming)) {
    nextHooks[event] = mergeHookEvent(nextHooks[event], matchers)
  }
  settings.hooks = nextHooks

  const payload = JSON.stringify(settings, null, 2) + "\n"
  await writeFile(settingsPath, payload, "utf-8")

  if (!quiet) {
    console.error(`[relay-flush] installed Claude Code hooks → ${settingsPath}`)
    console.error("[relay-flush] restart Claude Code, then run /hooks to confirm.")
  }
}

async function main() {
  const rawArgs = process.argv.slice(2)
  if (rawArgs[0] === "install-claude-code" || rawArgs[0] === "install-skill") {
    const quiet = rawArgs.includes("--quiet") || rawArgs.includes("-q")
    await installClaudeCodeSkill(quiet)
    process.exit(0)
  }

  const args = parseArgs(rawArgs)

  let config
  try {
    config = await loadConfig()
  } catch (error) {
    if (!args.quiet) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[relay-flush] skipped: ${message}`)
    }
    process.exit(0)
  }

  const projectId = args.projectId ?? config.projectId
  if (!projectId) {
    if (!args.quiet) {
      console.error(
        "[relay-flush] skipped: no project configured. Set RELAY_PROJECT_ID, pass --project=<uuid>, or run relay-mcp to configure.",
      )
    }
    process.exit(0)
  }

  const client = new RelayClient(config)
  const result = await client.sweepOpenWorkSessions(projectId, {
    idleMs: args.idleMs,
    reason: args.reason,
  })

  if (!args.quiet) {
    console.error(
      `[relay-flush] reason=${args.reason} flushed=${result.flushedCount} skipped=${result.skippedCount}`,
    )
  }

  // Never fail the parent process. Hook failures must not interrupt the user.
  process.exit(0)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[relay-flush] unexpected error: ${message}`)
  process.exit(0)
})
