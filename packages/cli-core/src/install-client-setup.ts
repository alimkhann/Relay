import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"

import type { DetectedIDE } from "./detect"
import { applyJsoncEdits, parseJsonc } from "./jsonc"

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
  hooksConfig?: {
    enabled?: boolean
    notifications?: boolean
    disabled?: string[]
  }
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

interface OpenCodeConfig {
  instructions?: string[]
  mcp?: Record<string, unknown>
  [key: string]: unknown
}

type JsonRecord = Record<string, unknown>

export type ClientSetupKind = "instructions" | "rules" | "hooks" | "skills"
export type ClientSetupStatus = "installed" | "updated" | "already-configured"

export interface ClientSetupArtifact {
  kind: ClientSetupKind
  path: string
  status: ClientSetupStatus
}

export interface ClientSetupResult {
  artifacts: ClientSetupArtifact[]
}

const RELAY_FLUSH_PREFIX = "relay-flush"
const RELAY_BLOCK_PREFIX = "RELAY MANAGED BLOCK"
const RELAY_SKILL_NAME = "relay-context"
const RELAY_FLUSH_BASE_COMMAND = "npx -y -p @onrelay/mcp relay-flush"

function buildRelayFlushCommand(
  reason: "precompact" | "session_end" | "stop" | "stop_failure" | "precompress" | "failure",
  options: { quiet?: boolean; failureOnly?: boolean } = {},
) {
  const parts = [RELAY_FLUSH_BASE_COMMAND, reason]
  if (options.failureOnly) parts.push("--failure-only")
  if (options.quiet !== false) parts.push("--quiet")
  return parts.join(" ")
}

const CLAUDE_HOOKS: Record<string, ClaudeHookMatcher[]> = {
  PreCompact: [
    { matcher: "*", hooks: [{ type: "command", command: buildRelayFlushCommand("precompact") }] },
  ],
  SessionEnd: [
    { matcher: "*", hooks: [{ type: "command", command: buildRelayFlushCommand("session_end") }] },
  ],
  StopFailure: [
    { matcher: "*", hooks: [{ type: "command", command: buildRelayFlushCommand("stop_failure") }] },
  ],
}

const CLAUDE_STALE_EVENTS = ["Stop"] as const

const GEMINI_HOOKS: Record<string, GeminiHookGroup[]> = {
  PreCompress: [
    {
      matcher: "*",
      hooks: [
        {
          name: "relay-precompress",
          type: "command",
          command: buildRelayFlushCommand("precompress"),
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
          command: buildRelayFlushCommand("session_end"),
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
          command: buildRelayFlushCommand("failure", { failureOnly: true }),
          timeout: 4000,
        },
      ],
    },
  ],
}

const WINDSURF_HOOKS: Record<string, WindsurfHookEntry[]> = {}

function isRelayHookCommand(command: string) {
  return /\brelay-flush\b/.test(command)
}

function isManagedRelayFlushCommand(command: string) {
  return isRelayHookCommand(command)
}

function isClaudeRelayHook(hook: ClaudeHookEntry) {
  return hook.type === "command" && isManagedRelayFlushCommand(hook.command)
}

function isGeminiRelayHook(hook: GeminiHookEntry) {
  return hook.type === "command" && isManagedRelayFlushCommand(hook.command)
}

function isWindsurfRelayHook(hook: WindsurfHookEntry) {
  return isRelayHookCommand(hook.command) || Boolean(hook.powershell && isRelayHookCommand(hook.powershell))
}

async function readText(path: string) {
  try {
    return await readFile(path, "utf-8")
  } catch {
    return ""
  }
}

function beginMarker(id: string) {
  return `<!-- BEGIN ${RELAY_BLOCK_PREFIX}: ${id} -->`
}

function endMarker(id: string) {
  return `<!-- END ${RELAY_BLOCK_PREFIX}: ${id} -->`
}

function buildManagedBlock(id: string, body: string) {
  return `${beginMarker(id)}\n${body.trim()}\n${endMarker(id)}`
}

function upsertManagedBlock(raw: string, id: string, body: string) {
  const block = buildManagedBlock(id, body)
  const start = beginMarker(id)
  const end = endMarker(id)
  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "m")

  if (pattern.test(raw)) {
    return raw.replace(pattern, block)
  }

  const trimmed = raw.trimEnd()
  return `${trimmed ? `${trimmed}\n\n` : ""}${block}\n`
}

function removeManagedBlock(raw: string, id: string) {
  const start = beginMarker(id)
  const end = endMarker(id)
  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "m")
  return raw.replace(pattern, raw.includes("\r\n") ? "\r\n" : "\n").replace(/\n{3,}/g, "\n\n").trimEnd()
}

async function upsertManagedMarkdownFile(path: string, blockId: string, body: string): Promise<ClientSetupArtifact> {
  const raw = await readText(path)
  const next = upsertManagedBlock(raw, blockId, body)

  if (next === raw) {
    return { kind: "instructions", path, status: "already-configured" }
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, "utf-8")
  return { kind: "instructions", path, status: raw ? "updated" : "installed" }
}

async function writeManagedFile(path: string, content: string, kind: ClientSetupKind): Promise<ClientSetupArtifact> {
  const raw = await readText(path)
  const normalized = content.endsWith("\n") ? content : `${content}\n`

  if (raw === normalized) {
    return { kind, path, status: "already-configured" }
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, normalized, "utf-8")
  return { kind, path, status: raw ? "updated" : "installed" }
}

async function removeManagedFile(path: string) {
  const raw = await readText(path)
  if (!raw) return false
  try {
    await rm(path, { force: true })
    return true
  } catch {
    return false
  }
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

async function loadJsonConfig<T extends JsonRecord>(path: string): Promise<{ raw: string; data: T }> {
  const raw = await readText(path)
  return {
    raw: raw || "{}\n",
    data: parseJsonc<T>(raw || "{}\n"),
  }
}

function buildRelayBehaviorBody(clientName: string, options: { hooks?: string[]; skillHint?: boolean } = {}) {
  const hookLine = options.hooks?.length
    ? `- Let ${options.hooks.join(", ")} handle normal autosave. Use manual checkpointing only when the current work would be costly to lose.`
    : "- Use \`checkpoint_context\` only at meaningful milestones, before switching tasks, or before compaction-equivalent actions."

  const skillLine = options.skillHint
    ? "- Load the Relay skill when you need a concise reminder of the correct read, search, and save pattern."
    : "- Avoid repeated Relay reads or writes when the current local conversation already contains the needed context."

  return [
    `## Relay for ${clientName}`,
    "",
    "- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or the wrong project.",
    "- Before architecture, product, or process decisions, prefer `search_context` or `recall_context` when local context may be incomplete.",
    "- Use `get_project_state` when you need the structured objective, constraints, or open tasks instead of a prose brief.",
    "- Use `add_memory` only for clearly confirmed durable facts: decisions, constraints, tasks, and stable product truths. Do not save speculative brainstorming until it is confirmed.",
    "- For coding work, save files/modules touched, public API or schema changes, migrations, tests run, unresolved blockers, and next steps when those facts would help a future session continue.",
    "- Use `checkpoint_context` only before compaction-equivalent risk, task switches, or explicit milestone saves. Use `save_context` only when wrapping up a meaningful unit of work.",
    hookLine,
    skillLine,
  ].join("\n")
}

function buildCursorRule() {
  return `---
description: Relay-managed Cursor guidance for using Relay MCP without noisy reads or writes.
alwaysApply: true
---

The canonical repository policy is in \`AGENTS.md\`. Follow it first.

- Start or resume with \`get_brief\`. Only call \`list_projects\` and \`set_current_project\` if Relay reports project ambiguity or the wrong project.
- Prefer \`search_context\` or \`recall_context\` before architectural, product, or process decisions when local context may be incomplete.
- Use \`add_memory\` only for clearly confirmed durable facts. Use \`checkpoint_context\` before compaction risk, task switches, or explicit milestone saves, and \`save_context\` only when wrapping a meaningful unit of work.
- Do not read or write Relay repeatedly when the current conversation already has the context you need.
- Cursor has no Relay-managed hook flow here, so checkpoint only at meaningful boundaries.
`
}

function buildWindsurfRule() {
  return `# Relay Windsurf Guidance

The canonical repository policy is in \`AGENTS.md\`. Follow it first.

- Start or resume with \`get_brief\`. Only call \`list_projects\` and \`set_current_project\` if Relay reports project ambiguity or the wrong project.
- Use \`search_context\` or \`recall_context\` before making architecture, product, or workflow decisions that might conflict with prior context.
- Use \`add_memory\` only for clearly confirmed durable facts. Use \`checkpoint_context\` before compaction risk, task switches, or milestone saves, and \`save_context\` only when ending a meaningful unit of work.
- Relay does not install noisy per-tool Windsurf autosave hooks by default. Keep saves deliberate and boundary-oriented.
`
}

function buildProjectRelayInstructions() {
  return `# Relay Guidance

- Start or resume with \`get_brief\`. Only call \`list_projects\` and \`set_current_project\` if Relay reports project ambiguity or the wrong project.
- Use \`search_context\` or \`recall_context\` before major architecture, product, or process decisions.
- Use \`add_memory\` only for clearly confirmed durable facts. Use \`checkpoint_context\` before compaction risk, task switches, or milestone saves, and \`save_context\` when you finish a meaningful unit of work.
- Do not overuse Relay when the current conversation already contains the necessary context.
`
}

function buildRelaySkill() {
  return `---
name: ${RELAY_SKILL_NAME}
description: Use Relay MCP intelligently for project briefs, context lookup, and durable saves without noisy writes.
license: Proprietary
compatibility: relay-mcp
metadata:
  author: Relay
  workflow: continuity
---

## When to use this skill

Use this skill when you are resuming work, switching projects, or deciding whether to read from or write to Relay.

## Recommended Relay flow

1. Start with \`get_brief\`.
2. Only if Relay reports project ambiguity or the wrong project, call \`list_projects\` and then \`set_current_project\`.
3. Use \`search_context\` or \`recall_context\` before major architecture, product, or process decisions when local context may be incomplete.
4. Save back deliberately:
   - \`add_memory\` only for clearly confirmed durable facts
   - \`checkpoint_context\` before compaction risk, task switches, or explicit milestones
   - \`save_context\` when wrapping a meaningful unit of work

## What to avoid

- Do not read Relay repeatedly when the current local conversation already has enough context.
- Do not write after every turn.
- Do not save speculative brainstorming until it is clearly confirmed.
- Do not call \`save_context\` just to restate work that is still in progress.
`
}

function resolveClaudeInstructionsPath(ide: DetectedIDE) {
  return join(dirname(ide.clientSetupPath ?? join(dirname(ide.mcpConfigPath), ".claude", "settings.json")), "CLAUDE.md")
}

function resolveGeminiInstructionsPath(ide: DetectedIDE) {
  return join(dirname(ide.clientSetupPath ?? ide.mcpConfigPath), "GEMINI.md")
}

function resolveCodexInstructionsPath(ide: DetectedIDE, configRaw: string) {
  const match = configRaw.match(/^\s*model_instructions_file\s*=\s*"(.+)"\s*$/m)?.[1]
  if (!match) return join(dirname(ide.mcpConfigPath), "AGENTS.md")
  const configDir = dirname(ide.mcpConfigPath)
  const homeLikeRoot = configDir.endsWith("/.codex") ? dirname(configDir) : configDir
  const expanded = match.startsWith("~/") ? join(homeLikeRoot, match.slice(2)) : match
  return isAbsolute(expanded) ? expanded : resolve(dirname(ide.mcpConfigPath), expanded)
}

function resolveCursorRulePath(ide: DetectedIDE) {
  return join(ide.workspaceRoot, ".cursor", "rules", "relay.mdc")
}

function resolveWindsurfRulePath(ide: DetectedIDE) {
  return join(ide.workspaceRoot, ".windsurf", "rules", "relay.md")
}

function resolveCopilotInstructionsPath(ide: DetectedIDE) {
  return join(ide.workspaceRoot, ".github", "copilot-instructions.md")
}

function resolveProjectRelayInstructionsPath(ide: DetectedIDE) {
  return join(ide.workspaceRoot, ".agents", "instructions", "relay.md")
}

function resolveProjectRelaySkillPath(ide: DetectedIDE) {
  return join(ide.workspaceRoot, ".agents", "skills", RELAY_SKILL_NAME, "SKILL.md")
}

async function installClaudeSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  const artifacts: ClientSetupArtifact[] = []

  if (ide.clientSetupPath) {
    const existing = await loadJsonConfig<ClaudeSettings>(ide.clientSetupPath)
    const nextHooks: Record<string, ClaudeHookMatcher[]> = { ...(existing.data.hooks ?? {}) }

    for (const [event, incoming] of Object.entries(CLAUDE_HOOKS)) {
      nextHooks[event] = mergeClaudeHookEvent(nextHooks[event], incoming)
    }

    for (const event of CLAUDE_STALE_EVENTS) {
      const groups = nextHooks[event]
      if (!groups) continue
      const scrubbed = groups
        .map((group) => ({
          matcher: group.matcher,
          hooks: group.hooks.filter((hook) => !isClaudeRelayHook(hook)),
        }))
        .filter((group) => group.hooks.length > 0)
      if (scrubbed.length > 0) {
        nextHooks[event] = scrubbed
      } else {
        delete nextHooks[event]
      }
    }

    const next = applyJsoncEdits(existing.raw, [{ path: ["hooks"], value: nextHooks }])
    if (next.changed) {
      await mkdir(dirname(ide.clientSetupPath), { recursive: true })
      await writeFile(ide.clientSetupPath, next.text, "utf-8")
      artifacts.push({ kind: "hooks", path: ide.clientSetupPath, status: existing.raw.trim() ? "updated" : "installed" })
    } else {
      artifacts.push({ kind: "hooks", path: ide.clientSetupPath, status: "already-configured" })
    }
  }

  artifacts.push(
    await upsertManagedMarkdownFile(
      resolveClaudeInstructionsPath(ide),
      "claude-code",
      buildRelayBehaviorBody("Claude Code", { hooks: ["PreCompact", "SessionEnd", "StopFailure"] })
    )
  )

  return { artifacts }
}

async function installGeminiSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  const artifacts: ClientSetupArtifact[] = []
  const settingsPath = ide.clientSetupPath ?? ide.mcpConfigPath
  const existing = await loadJsonConfig<GeminiSettings>(settingsPath)
  const nextHooks: Record<string, GeminiHookGroup[]> = { ...(existing.data.hooks ?? {}) }

  for (const [event, incoming] of Object.entries(GEMINI_HOOKS)) {
    nextHooks[event] = mergeGeminiHookEvent(nextHooks[event], incoming)
  }

  const next = applyJsoncEdits(existing.raw, [
    { path: ["hooks"], value: nextHooks },
    {
      path: ["hooksConfig"],
      value: {
        ...(existing.data.hooksConfig ?? {}),
        enabled: true,
        notifications: existing.data.hooksConfig?.notifications ?? true,
      },
    },
  ])

  if (next.changed) {
    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(settingsPath, next.text, "utf-8")
    artifacts.push({ kind: "hooks", path: settingsPath, status: existing.raw.trim() ? "updated" : "installed" })
  } else {
    artifacts.push({ kind: "hooks", path: settingsPath, status: "already-configured" })
  }

  artifacts.push(
    await upsertManagedMarkdownFile(
      resolveGeminiInstructionsPath(ide),
      "gemini-cli",
      buildRelayBehaviorBody("Gemini CLI", { hooks: ["PreCompress", "SessionEnd", "AfterAgent"] })
    )
  )

  return { artifacts }
}

async function installWindsurfSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  const artifacts: ClientSetupArtifact[] = []

  if (ide.clientSetupPath) {
    const existing = await loadJsonConfig<WindsurfSettings>(ide.clientSetupPath)
    const nextHooks = Object.fromEntries(
      Object.entries(existing.data.hooks ?? {})
        .map(([event, hooks]) => {
          const keptHooks = hooks.filter((hook) => !isWindsurfRelayHook(hook))
          return [event, keptHooks] as const
        })
        .filter(([, hooks]) => hooks.length > 0),
    )
    const next = applyJsoncEdits(existing.raw, [{ path: ["hooks"], value: Object.keys(nextHooks).length > 0 ? nextHooks : undefined }])
    if (next.changed) {
      await mkdir(dirname(ide.clientSetupPath), { recursive: true })
      await writeFile(ide.clientSetupPath, next.text, "utf-8")
      artifacts.push({ kind: "hooks", path: ide.clientSetupPath, status: "updated" })
    }
  }

  artifacts.push(await writeManagedFile(resolveWindsurfRulePath(ide), buildWindsurfRule(), "rules"))
  return { artifacts }
}

async function installCursorSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  return {
    artifacts: [await writeManagedFile(resolveCursorRulePath(ide), buildCursorRule(), "rules")],
  }
}

async function installVsCodeSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  return {
    artifacts: [
      await upsertManagedMarkdownFile(
        resolveCopilotInstructionsPath(ide),
        "copilot",
        buildRelayBehaviorBody("VS Code / Copilot")
      ),
    ],
  }
}

async function installCodexSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  const configRaw = await readText(ide.mcpConfigPath)
  const instructionsPath = resolveCodexInstructionsPath(ide, configRaw)

  return {
    artifacts: [
      await upsertManagedMarkdownFile(
        instructionsPath,
        "codex",
        buildRelayBehaviorBody("Codex")
      ),
    ],
  }
}

async function installOpenCodeSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  const artifacts: ClientSetupArtifact[] = []
  const instructionsPath = ".agents/instructions/relay.md"

  artifacts.push(await writeManagedFile(resolveProjectRelayInstructionsPath(ide), buildProjectRelayInstructions(), "instructions"))
  artifacts.push(await writeManagedFile(resolveProjectRelaySkillPath(ide), buildRelaySkill(), "skills"))

  const existing = await loadJsonConfig<OpenCodeConfig>(ide.mcpConfigPath)
  const currentInstructions = Array.isArray(existing.data.instructions) ? existing.data.instructions.filter((value): value is string => typeof value === "string") : []
  const nextInstructions = Array.from(new Set([...currentInstructions, "AGENTS.md", instructionsPath]))
  const next = applyJsoncEdits(existing.raw, [{ path: ["instructions"], value: nextInstructions }])
  if (next.changed) {
    await mkdir(dirname(ide.mcpConfigPath), { recursive: true })
    await writeFile(ide.mcpConfigPath, next.text, "utf-8")
    artifacts.push({ kind: "instructions", path: ide.mcpConfigPath, status: existing.raw.trim() ? "updated" : "installed" })
  } else {
    artifacts.push({ kind: "instructions", path: ide.mcpConfigPath, status: "already-configured" })
  }

  return { artifacts }
}

export async function installClientSetup(ide: DetectedIDE): Promise<ClientSetupResult> {
  switch (ide.id) {
    case "claude":
      return installClaudeSetup(ide)
    case "codex-cli":
    case "codex-app":
      return installCodexSetup(ide)
    case "cursor-project":
    case "cursor-global":
      return installCursorSetup(ide)
    case "vscode":
      return installVsCodeSetup(ide)
    case "windsurf":
      return installWindsurfSetup(ide)
    case "gemini-cli":
      return installGeminiSetup(ide)
    case "opencode":
      return installOpenCodeSetup(ide)
    default:
      return { artifacts: [] }
  }
}

async function uninstallClaudeSetup(ide: DetectedIDE) {
  let changed = false

  if (ide.clientSetupPath) {
    const settings = await loadJsonConfig<ClaudeSettings>(ide.clientSetupPath)
    if (settings.data.hooks) {
      const nextHooks = Object.fromEntries(
        Object.entries(settings.data.hooks)
          .map(([event, groups]) => {
            const filteredGroups = groups
              .map((group) => ({
                matcher: group.matcher,
                hooks: group.hooks.filter((hook) => !isClaudeRelayHook(hook)),
              }))
              .filter((group) => group.hooks.length > 0)
            return [event, filteredGroups]
          })
          .filter((entry) => (entry[1]?.length ?? 0) > 0) as Array<[string, ClaudeHookMatcher[]]>
      )

      const next = applyJsoncEdits(settings.raw, [{ path: ["hooks"], value: Object.keys(nextHooks).length > 0 ? nextHooks : undefined }])
      if (next.changed) {
        await writeFile(ide.clientSetupPath, next.text, "utf-8")
        changed = true
      }
    }
  }

  const instructionsPath = resolveClaudeInstructionsPath(ide)
  const rawInstructions = await readText(instructionsPath)
  if (rawInstructions) {
    const next = removeManagedBlock(rawInstructions, "claude-code")
    if (next !== rawInstructions) {
      await writeFile(instructionsPath, next ? `${next}\n` : "", "utf-8")
      changed = true
    }
  }

  return changed
}

async function uninstallGeminiSetup(ide: DetectedIDE) {
  let changed = false
  const settingsPath = ide.clientSetupPath ?? ide.mcpConfigPath
  const settings = await loadJsonConfig<GeminiSettings>(settingsPath)

  if (settings.data.hooks) {
    const nextHooks = Object.fromEntries(
      Object.entries(settings.data.hooks)
        .map(([event, groups]) => {
          const filteredGroups = groups
            .map((group) => ({
              ...group,
              hooks: group.hooks.filter((hook) => !isGeminiRelayHook(hook)),
            }))
            .filter((group) => group.hooks.length > 0)
          return [event, filteredGroups]
        })
        .filter((entry) => (entry[1]?.length ?? 0) > 0) as Array<[string, GeminiHookGroup[]]>
    )

    const next = applyJsoncEdits(settings.raw, [{ path: ["hooks"], value: Object.keys(nextHooks).length > 0 ? nextHooks : undefined }])
    if (next.changed) {
      await writeFile(settingsPath, next.text, "utf-8")
      changed = true
    }
  }

  const instructionsPath = resolveGeminiInstructionsPath(ide)
  const rawInstructions = await readText(instructionsPath)
  if (rawInstructions) {
    const next = removeManagedBlock(rawInstructions, "gemini-cli")
    if (next !== rawInstructions) {
      await writeFile(instructionsPath, next ? `${next}\n` : "", "utf-8")
      changed = true
    }
  }

  return changed
}

async function uninstallWindsurfSetup(ide: DetectedIDE) {
  let changed = false

  if (ide.clientSetupPath) {
    const settings = await loadJsonConfig<WindsurfSettings>(ide.clientSetupPath)
    if (settings.data.hooks) {
      const nextHooks = Object.fromEntries(
        Object.entries(settings.data.hooks)
          .map(([event, hooks]) => [event, hooks.filter((hook) => !isWindsurfRelayHook(hook))])
          .filter((entry) => (entry[1]?.length ?? 0) > 0) as Array<[string, WindsurfHookEntry[]]>
      )

      const next = applyJsoncEdits(settings.raw, [{ path: ["hooks"], value: Object.keys(nextHooks).length > 0 ? nextHooks : undefined }])
      if (next.changed) {
        await writeFile(ide.clientSetupPath, next.text, "utf-8")
        changed = true
      }
    }
  }

  if (await removeManagedFile(resolveWindsurfRulePath(ide))) {
    changed = true
  }

  return changed
}

async function uninstallCursorSetup(ide: DetectedIDE) {
  return removeManagedFile(resolveCursorRulePath(ide))
}

async function uninstallVsCodeSetup(ide: DetectedIDE) {
  const path = resolveCopilotInstructionsPath(ide)
  const raw = await readText(path)
  if (!raw) return false
  const next = removeManagedBlock(raw, "copilot")
  if (next === raw) return false
  await writeFile(path, next ? `${next}\n` : "", "utf-8")
  return true
}

async function uninstallCodexSetup(ide: DetectedIDE) {
  const configRaw = await readText(ide.mcpConfigPath)
  const path = resolveCodexInstructionsPath(ide, configRaw)
  const raw = await readText(path)
  if (!raw) return false
  const next = removeManagedBlock(raw, "codex")
  if (next === raw) return false
  await writeFile(path, next ? `${next}\n` : "", "utf-8")
  return true
}

async function uninstallOpenCodeSetup(ide: DetectedIDE) {
  let changed = false
  if (await removeManagedFile(resolveProjectRelayInstructionsPath(ide))) changed = true
  if (await removeManagedFile(resolveProjectRelaySkillPath(ide))) changed = true

  const existing = await loadJsonConfig<OpenCodeConfig>(ide.mcpConfigPath)
  const currentInstructions = Array.isArray(existing.data.instructions) ? existing.data.instructions.filter((value): value is string => typeof value === "string") : []
  const nextInstructions = currentInstructions.filter((value) => value !== "AGENTS.md" && value !== ".agents/instructions/relay.md")
  const next = applyJsoncEdits(existing.raw, [{ path: ["instructions"], value: nextInstructions.length > 0 ? nextInstructions : undefined }])

  if (next.changed) {
    await writeFile(ide.mcpConfigPath, next.text, "utf-8")
    changed = true
  }

  return changed
}

export async function uninstallClientSetup(ide: DetectedIDE): Promise<boolean> {
  switch (ide.id) {
    case "claude":
      return uninstallClaudeSetup(ide)
    case "codex-cli":
    case "codex-app":
      return uninstallCodexSetup(ide)
    case "cursor-project":
    case "cursor-global":
      return uninstallCursorSetup(ide)
    case "vscode":
      return uninstallVsCodeSetup(ide)
    case "windsurf":
      return uninstallWindsurfSetup(ide)
    case "gemini-cli":
      return uninstallGeminiSetup(ide)
    case "opencode":
      return uninstallOpenCodeSetup(ide)
    default:
      return false
  }
}

function hasManagedBlock(raw: string, blockId: string) {
  return raw.includes(beginMarker(blockId)) && raw.includes(endMarker(blockId))
}

export async function validateInstalledClientSetup(ide: DetectedIDE): Promise<boolean> {
  switch (ide.id) {
    case "claude": {
      const settingsPath = ide.clientSetupPath
      if (!settingsPath) return false
      const settings = await loadJsonConfig<ClaudeSettings>(settingsPath)
      const instructions = await readText(resolveClaudeInstructionsPath(ide))
      return Boolean(settings.data.hooks?.PreCompact?.some((group) => group.hooks.some((hook) => isClaudeRelayHook(hook))))
        && Boolean(settings.data.hooks?.StopFailure?.some((group) => group.hooks.some((hook) => isClaudeRelayHook(hook))))
        && hasManagedBlock(instructions, "claude-code")
    }
    case "codex-cli":
    case "codex-app": {
      const instructions = await readText(resolveCodexInstructionsPath(ide, await readText(ide.mcpConfigPath)))
      return hasManagedBlock(instructions, "codex")
    }
    case "cursor-project":
    case "cursor-global": {
      const rule = await readText(resolveCursorRulePath(ide))
      return rule.includes("Relay-managed Cursor guidance")
    }
    case "vscode": {
      const instructions = await readText(resolveCopilotInstructionsPath(ide))
      return hasManagedBlock(instructions, "copilot")
    }
    case "windsurf": {
      const rule = await readText(resolveWindsurfRulePath(ide))
      if (!rule.includes("Relay Windsurf Guidance")) return false
      if (!ide.clientSetupPath) return true
      const settings = await loadJsonConfig<WindsurfSettings>(ide.clientSetupPath)
      return !Object.values(settings.data.hooks ?? {}).flat().some((hook) => isWindsurfRelayHook(hook))
    }
    case "gemini-cli": {
      const settings = await loadJsonConfig<GeminiSettings>(ide.clientSetupPath ?? ide.mcpConfigPath)
      const instructions = await readText(resolveGeminiInstructionsPath(ide))
      return Boolean(settings.data.hooks?.PreCompress?.some((group) => group.hooks.some((hook) => isGeminiRelayHook(hook))))
        && Boolean(settings.data.hooks?.AfterAgent?.some((group) => group.hooks.some((hook) => isGeminiRelayHook(hook))))
        && hasManagedBlock(instructions, "gemini-cli")
    }
    case "opencode": {
      const config = await loadJsonConfig<OpenCodeConfig>(ide.mcpConfigPath)
      const instructions = Array.isArray(config.data.instructions) ? config.data.instructions : []
      const projectInstructions = await readText(resolveProjectRelayInstructionsPath(ide))
      const skill = await readText(resolveProjectRelaySkillPath(ide))
      return instructions.includes(".agents/instructions/relay.md")
        && projectInstructions.includes("# Relay Guidance")
        && skill.includes(`name: ${RELAY_SKILL_NAME}`)
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
