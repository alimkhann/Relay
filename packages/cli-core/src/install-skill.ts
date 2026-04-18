import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import type { DetectedIDE } from "./detect"

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

const RELAY_FLUSH_PREFIX = "relay-flush"
const CLAUDE_HOOKS: Record<string, HookMatcher[]> = {
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

function isRelayHook(hook: HookEntry) {
  return hook.type === "command" && hook.command.startsWith(RELAY_FLUSH_PREFIX)
}

function mergeHookEvent(existing: HookMatcher[] | undefined, incoming: HookMatcher[]) {
  const merged: HookMatcher[] = [...(existing ?? [])]

  for (const entry of incoming) {
    const index = merged.findIndex((matcher) => matcher.matcher === entry.matcher)
    if (index === -1) {
      merged.push(entry)
      continue
    }

    const current = merged[index]
    if (!current) continue
    merged[index] = {
      matcher: current.matcher,
      hooks: [...current.hooks.filter((hook) => !isRelayHook(hook)), ...entry.hooks],
    }
  }

  return merged
}

async function loadClaudeSettings(path: string): Promise<ClaudeSettings> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as ClaudeSettings
  } catch {
    return {}
  }
}

export async function installClientSetup(ide: DetectedIDE): Promise<string | null> {
  if (ide.id !== "claude" || !ide.instructionPath) return null

  const settingsPath = ide.instructionPath
  const settings = await loadClaudeSettings(settingsPath)
  const nextHooks: Record<string, HookMatcher[]> = { ...(settings.hooks ?? {}) }

  for (const [event, incoming] of Object.entries(CLAUDE_HOOKS)) {
    nextHooks[event] = mergeHookEvent(nextHooks[event], incoming)
  }

  settings.hooks = nextHooks
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8")
  return settingsPath
}

export async function uninstallClientSetup(ide: DetectedIDE): Promise<boolean> {
  if (ide.id !== "claude" || !ide.instructionPath) return false

  const settingsPath = ide.instructionPath
  const settings = await loadClaudeSettings(settingsPath)
  if (!settings.hooks) return false

  let changed = false
  const nextHooks = Object.fromEntries(
    Object.entries(settings.hooks)
      .map(([event, groups]) => {
        const filteredGroups = groups
          .map((group) => ({
            matcher: group.matcher,
            hooks: group.hooks.filter((hook) => !isRelayHook(hook)),
          }))
          .filter((group) => group.hooks.length > 0)

        if (filteredGroups.length !== groups.length || filteredGroups.some((group, index) => group.hooks.length !== (groups[index]?.hooks.length ?? 0))) {
          changed = true
        }

        return [event, filteredGroups]
      })
      .filter((entry) => (entry[1]?.length ?? 0) > 0) as Array<[string, HookMatcher[]]>
  )

  if (!changed) return false

  settings.hooks = Object.keys(nextHooks).length > 0 ? nextHooks : undefined
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8")
  return true
}

// Deprecated aliases retained so older callers still compile until all
// installer messaging is migrated.
export async function installSkillFile(ide: DetectedIDE) {
  return installClientSetup(ide)
}

export async function uninstallSkillFile(ide: DetectedIDE) {
  return uninstallClientSetup(ide)
}

export async function installUniversalSkillFile(): Promise<null> {
  return null
}

export async function uninstallUniversalSkillFile(): Promise<boolean> {
  return false
}
