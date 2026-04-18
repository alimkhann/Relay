import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import type { DetectedIDE } from "./detect"

interface ClaudeHookEntry {
  type: string
  command: string
}

interface ClaudeHookMatcher {
  matcher: string
  hooks: ClaudeHookEntry[]
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookMatcher[]>
  [key: string]: unknown
}

interface GeminiHookEntry {
  type: "command"
  command: string
  name?: string
  timeout?: number
  description?: string
}

interface GeminiHookGroup {
  matcher?: string
  sequential?: boolean
  hooks: GeminiHookEntry[]
}

interface GeminiSettings {
  hooks?: Record<string, GeminiHookGroup[]>
  [key: string]: unknown
}

interface WindsurfHookEntry {
  command: string
  powershell?: string
  show_output?: boolean
  working_directory?: string
}

interface WindsurfSettings {
  hooks?: Record<string, WindsurfHookEntry[]>
  [key: string]: unknown
}

type JsonRecord = Record<string, unknown>

const RELAY_FLUSH_PREFIX = "relay-flush"

const CLAUDE_HOOKS: Record<string, ClaudeHookMatcher[]> = {
  PreCompact: [
    { matcher: "*", hooks: [{ type: "command", command: "relay-flush precompact --quiet" }] },
  ],
  SessionEnd: [
    { matcher: "*", hooks: [{ type: "command", command: "relay-flush session_end --quiet" }] },
  ],
  Stop: [
    { matcher: "*", hooks: [{ type: "command", command: "relay-flush stop --quiet" }] },
  ],
  StopFailure: [
    { matcher: "*", hooks: [{ type: "command", command: "relay-flush stop_failure --quiet" }] },
  ],
}

const GEMINI_HOOKS: Record<string, GeminiHookGroup[]> = {
  PreCompress: [
    {
      matcher: "*",
      hooks: [
        {
          name: "relay-precompress",
          type: "command",
          command: "relay-flush precompress --quiet",
          timeout: 5000,
        },
      ],
    },
  ],
  SessionEnd: [
    {
      matcher: "*",
      hooks: [
        {
          name: "relay-session-end",
          type: "command",
          command: "relay-flush session_end --quiet",
          timeout: 5000,
        },
      ],
    },
  ],
  AfterAgent: [
    {
      matcher: "*",
      hooks: [
        {
          name: "relay-after-agent-failure",
          type: "command",
          command: "relay-flush failure --quiet --failure-only",
          timeout: 4000,
        },
      ],
    },
  ],
}

const WINDSURF_HOOKS: Record<string, WindsurfHookEntry[]> = {
  post_cascade_response_with_transcript: [
    {
      command: "relay-flush failure --quiet --failure-only",
      show_output: false,
    },
  ],
  post_mcp_tool_use: [
    {
      command: "relay-flush mcp_tool_use --quiet --idle=5m",
      show_output: false,
    },
  ],
}

function isRelayHookCommand(command: string) {
  return command.startsWith(RELAY_FLUSH_PREFIX)
}

function isClaudeRelayHook(hook: ClaudeHookEntry) {
  return hook.type === "command" && isRelayHookCommand(hook.command)
}

function isGeminiRelayHook(hook: GeminiHookEntry) {
  return hook.type === "command" && isRelayHookCommand(hook.command)
}

function isWindsurfRelayHook(hook: WindsurfHookEntry) {
  return isRelayHookCommand(hook.command) || Boolean(hook.powershell && isRelayHookCommand(hook.powershell))
}

async function loadJsonConfig<T extends JsonRecord>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T
  } catch {
    return {} as T
  }
}

async function writeJsonConfig(path: string, payload: JsonRecord) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf-8")
}

function stripEmptyRecords<T extends JsonRecord>(value: T | undefined): T | undefined {
  if (!value) return undefined
  return Object.keys(value).length > 0 ? value : undefined
}

function mergeClaudeHookEvent(existing: ClaudeHookMatcher[] | undefined, incoming: ClaudeHookMatcher[]) {
  const merged: ClaudeHookMatcher[] = [...(existing ?? [])]

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
      hooks: [...current.hooks.filter((hook) => !isClaudeRelayHook(hook)), ...entry.hooks],
    }
  }

  return merged
}

function mergeGeminiHookEvent(existing: GeminiHookGroup[] | undefined, incoming: GeminiHookGroup[]) {
  const merged: GeminiHookGroup[] = [...(existing ?? [])]

  for (const entry of incoming) {
    const matcher = entry.matcher ?? "*"
    const index = merged.findIndex((group) => (group.matcher ?? "*") === matcher)
    if (index === -1) {
      merged.push(entry)
      continue
    }

    const current = merged[index]
    if (!current) continue
    merged[index] = {
      ...current,
      matcher,
      sequential: entry.sequential ?? current.sequential,
      hooks: [...current.hooks.filter((hook) => !isGeminiRelayHook(hook)), ...entry.hooks],
    }
  }

  return merged
}

function mergeWindsurfHookEvent(existing: WindsurfHookEntry[] | undefined, incoming: WindsurfHookEntry[]) {
  return [...(existing ?? []).filter((hook) => !isWindsurfRelayHook(hook)), ...incoming]
}

async function installClaudeSetup(ide: DetectedIDE) {
  if (!ide.clientSetupPath) return null
  const settings = await loadJsonConfig<ClaudeSettings>(ide.clientSetupPath)
  const nextHooks: Record<string, ClaudeHookMatcher[]> = { ...(settings.hooks ?? {}) }

  for (const [event, incoming] of Object.entries(CLAUDE_HOOKS)) {
    nextHooks[event] = mergeClaudeHookEvent(nextHooks[event], incoming)
  }

  settings.hooks = nextHooks
  await writeJsonConfig(ide.clientSetupPath, settings)
  return ide.clientSetupPath
}

async function installGeminiSetup(ide: DetectedIDE) {
  if (!ide.clientSetupPath) return null
  const settings = await loadJsonConfig<GeminiSettings>(ide.clientSetupPath)
  const nextHooks: Record<string, GeminiHookGroup[]> = { ...(settings.hooks ?? {}) }

  for (const [event, incoming] of Object.entries(GEMINI_HOOKS)) {
    nextHooks[event] = mergeGeminiHookEvent(nextHooks[event], incoming)
  }

  settings.hooks = nextHooks
  await writeJsonConfig(ide.clientSetupPath, settings)
  return ide.clientSetupPath
}

async function installWindsurfSetup(ide: DetectedIDE) {
  if (!ide.clientSetupPath) return null
  const settings = await loadJsonConfig<WindsurfSettings>(ide.clientSetupPath)
  const nextHooks: Record<string, WindsurfHookEntry[]> = { ...(settings.hooks ?? {}) }

  for (const [event, incoming] of Object.entries(WINDSURF_HOOKS)) {
    nextHooks[event] = mergeWindsurfHookEvent(nextHooks[event], incoming)
  }

  settings.hooks = nextHooks
  await writeJsonConfig(ide.clientSetupPath, settings)
  return ide.clientSetupPath
}

export async function installClientSetup(ide: DetectedIDE): Promise<string | null> {
  if (!ide.clientSetupPath) return null

  switch (ide.id) {
    case "claude":
      return installClaudeSetup(ide)
    case "gemini-cli":
      return installGeminiSetup(ide)
    case "windsurf":
      return installWindsurfSetup(ide)
    default:
      return null
  }
}

async function uninstallClaudeSetup(ide: DetectedIDE) {
  if (!ide.clientSetupPath) return false

  const settings = await loadJsonConfig<ClaudeSettings>(ide.clientSetupPath)
  if (!settings.hooks) return false

  let changed = false
  const nextHooks = Object.fromEntries(
    Object.entries(settings.hooks)
      .map(([event, groups]) => {
        const filteredGroups = groups
          .map((group) => ({
            matcher: group.matcher,
            hooks: group.hooks.filter((hook) => !isClaudeRelayHook(hook)),
          }))
          .filter((group) => group.hooks.length > 0)

        if (
          filteredGroups.length !== groups.length ||
          filteredGroups.some((group, index) => group.hooks.length !== (groups[index]?.hooks.length ?? 0))
        ) {
          changed = true
        }

        return [event, filteredGroups]
      })
      .filter((entry) => (entry[1]?.length ?? 0) > 0) as Array<[string, ClaudeHookMatcher[]]>
  )

  if (!changed) return false
  settings.hooks = stripEmptyRecords(nextHooks)
  await writeJsonConfig(ide.clientSetupPath, settings)
  return true
}

async function uninstallGeminiSetup(ide: DetectedIDE) {
  if (!ide.clientSetupPath) return false

  const settings = await loadJsonConfig<GeminiSettings>(ide.clientSetupPath)
  if (!settings.hooks) return false

  let changed = false
  const nextHooks = Object.fromEntries(
    Object.entries(settings.hooks)
      .map(([event, groups]) => {
        const filteredGroups = groups
          .map((group) => ({
            ...group,
            hooks: group.hooks.filter((hook) => !isGeminiRelayHook(hook)),
          }))
          .filter((group) => group.hooks.length > 0)

        if (
          filteredGroups.length !== groups.length ||
          filteredGroups.some((group, index) => group.hooks.length !== (groups[index]?.hooks.length ?? 0))
        ) {
          changed = true
        }

        return [event, filteredGroups]
      })
      .filter((entry) => (entry[1]?.length ?? 0) > 0) as Array<[string, GeminiHookGroup[]]>
  )

  if (!changed) return false
  settings.hooks = stripEmptyRecords(nextHooks)
  await writeJsonConfig(ide.clientSetupPath, settings)
  return true
}

async function uninstallWindsurfSetup(ide: DetectedIDE) {
  if (!ide.clientSetupPath) return false

  const settings = await loadJsonConfig<WindsurfSettings>(ide.clientSetupPath)
  if (!settings.hooks) return false

  let changed = false
  const nextHooks = Object.fromEntries(
    Object.entries(settings.hooks)
      .map(([event, hooks]) => {
        const filteredHooks = hooks.filter((hook) => !isWindsurfRelayHook(hook))
        if (filteredHooks.length !== hooks.length) {
          changed = true
        }
        return [event, filteredHooks]
      })
      .filter((entry) => (entry[1]?.length ?? 0) > 0) as Array<[string, WindsurfHookEntry[]]>
  )

  if (!changed) return false
  settings.hooks = stripEmptyRecords(nextHooks)
  await writeJsonConfig(ide.clientSetupPath, settings)
  return true
}

export async function uninstallClientSetup(ide: DetectedIDE): Promise<boolean> {
  switch (ide.id) {
    case "claude":
      return uninstallClaudeSetup(ide)
    case "gemini-cli":
      return uninstallGeminiSetup(ide)
    case "windsurf":
      return uninstallWindsurfSetup(ide)
    default:
      return false
  }
}

export async function validateInstalledClientSetup(ide: DetectedIDE): Promise<boolean> {
  if (!ide.clientSetupPath) return true

  switch (ide.id) {
    case "claude": {
      const settings = await loadJsonConfig<ClaudeSettings>(ide.clientSetupPath)
      return Boolean(settings.hooks?.PreCompact?.some((group) => group.hooks.some((hook) => isClaudeRelayHook(hook))))
        && Boolean(settings.hooks?.StopFailure?.some((group) => group.hooks.some((hook) => isClaudeRelayHook(hook))))
    }
    case "gemini-cli": {
      const settings = await loadJsonConfig<GeminiSettings>(ide.clientSetupPath)
      return Boolean(settings.hooks?.PreCompress?.some((group) => group.hooks.some((hook) => isGeminiRelayHook(hook))))
        && Boolean(settings.hooks?.AfterAgent?.some((group) => group.hooks.some((hook) => isGeminiRelayHook(hook))))
    }
    case "windsurf": {
      const settings = await loadJsonConfig<WindsurfSettings>(ide.clientSetupPath)
      return Boolean(settings.hooks?.post_cascade_response_with_transcript?.some((hook) => isWindsurfRelayHook(hook)))
        && Boolean(settings.hooks?.post_mcp_tool_use?.some((hook) => isWindsurfRelayHook(hook)))
    }
    default:
      return true
  }
}

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
