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

type FlushReason =
  | "precompact"
  | "precompress"
  | "session_end"
  | "stop"
  | "stop_failure"
  | "failure"
  | "mcp_tool_use"
  | "explicit"

interface ParsedArgs {
  reason: FlushReason
  idleMs: number
  projectId?: string
  quiet: boolean
  failureOnly: boolean
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
  const args: ParsedArgs = { reason: "explicit", idleMs: 0, quiet: false, failureOnly: false }
  for (const raw of argv) {
    if (
      raw === "precompact" ||
      raw === "precompress" ||
      raw === "session_end" ||
      raw === "stop" ||
      raw === "stop_failure" ||
      raw === "failure" ||
      raw === "mcp_tool_use" ||
      raw === "explicit"
    ) {
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
    if (raw === "--failure-only") {
      args.failureOnly = true
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
const RELAY_FLUSH_BASE_COMMAND = "npx -y -p @onrelay/mcp relay-flush"

function buildRelayFlushCommand(reason: FlushReason) {
  return `${RELAY_FLUSH_BASE_COMMAND} ${reason} --quiet`
}

async function loadBundledClaudeHooks(): Promise<Record<string, HookMatcher[]>> {
  const bundledHooksPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "skills",
    "relay-autosave",
    "hooks.json",
  )
  try {
    const raw = await readFile(bundledHooksPath, "utf-8")
    const parsed = JSON.parse(raw) as { hooks?: Record<string, HookMatcher[]> }
    return parsed.hooks ?? {}
  } catch {
    // Fallback: ship the canonical Claude hook set inline so the CLI works
    // even when the packaged docs directory isn't adjacent to dist/.
    return {
      PreCompact: [
        { matcher: "*", hooks: [{ type: "command", command: buildRelayFlushCommand("precompact") }] },
      ],
      SessionEnd: [
        { matcher: "*", hooks: [{ type: "command", command: buildRelayFlushCommand("session_end") }] },
      ],
      Stop: [
        { matcher: "*", hooks: [{ type: "command", command: buildRelayFlushCommand("stop") }] },
      ],
      StopFailure: [
        { matcher: "*", hooks: [{ type: "command", command: buildRelayFlushCommand("stop_failure") }] },
      ],
    }
  }
}

function looksLikeFailureSignal(raw: string) {
  const normalized = raw.toLowerCase()
  const patterns = [
    "rate limit",
    "quota",
    "too many requests",
    "try again later",
    "api error",
    "temporarily unavailable",
    "context window",
    "request failed",
  ]
  return patterns.some((pattern) => normalized.includes(pattern))
}

async function shouldSkipFailureOnlyFlush() {
  const chunks: string[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8"))
  }

  const raw = chunks.join("").trim()
  if (!raw) return true

  if (looksLikeFailureSignal(raw)) return false

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const candidateValues = [
      parsed["prompt_response"],
      parsed["reason"],
      parsed["message"],
      JSON.stringify(parsed["tool_info"] ?? null),
    ]
      .filter((value): value is string => typeof value === "string")
      .join("\n")

    return !looksLikeFailureSignal(candidateValues)
  } catch {
    return !looksLikeFailureSignal(raw)
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

async function installClaudeCodeSetup(quiet: boolean) {
  const settingsPath = join(homedir(), ".claude", "settings.json")
  await mkdir(dirname(settingsPath), { recursive: true })

  let settings: ClaudeSettings = {}
  try {
    const raw = await readFile(settingsPath, "utf-8")
    settings = JSON.parse(raw) as ClaudeSettings
  } catch {
    // File doesn't exist yet or isn't JSON — we'll create a fresh one.
  }

  const incoming = await loadBundledClaudeHooks()
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
  if (
    rawArgs[0] === "install-claude-code" ||
    rawArgs[0] === "install-client-setup" ||
    rawArgs[0] === "install-skill"
  ) {
    const quiet = rawArgs.includes("--quiet") || rawArgs.includes("-q")
    await installClaudeCodeSetup(quiet)
    process.exit(0)
  }

  const args = parseArgs(rawArgs)

  if (args.failureOnly && await shouldSkipFailureOnlyFlush()) {
    process.exit(0)
  }

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
        "[relay-flush] skipped: no project configured. Set RELAY_PROJECT_ID, pass --project=<uuid>, or run relay-mcp or get_brief to configure the correct project.",
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
