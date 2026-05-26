/**
 * Parse hygiene commands the user can type into the assistant chat to
 * directly manage memory items without going through the LLM:
 *
 *   /reaffirm <id>   bump last_reaffirmed_at; resets decay clock.
 *   /forget <id>     lifecycle to forgotten, nulls content. Irreversible.
 *   /obsolete <id>   sets valid_until=now() + lifecycle to cooling.
 *   /archive <id>    lifecycle to archived (hidden from default recall).
 *   /restore <id>    lifecycle to active.
 *
 * The parser is conservative: must be a single command on its own line.
 *
 * Memory IDs are UUIDs in production; the regex accepts any 8+ char hex/dash
 * blob so test fixtures + short IDs work too.
 */

export type AssistantCommandName =
  | "reaffirm"
  | "forget"
  | "obsolete"
  | "archive"
  | "restore"

export interface ParsedAssistantCommand {
  command: AssistantCommandName
  memoryId: string
}

const COMMAND_PATTERN = /^\s*\/(reaffirm|forget|obsolete|archive|restore)\s+([A-Za-z0-9-]{8,})\s*$/i

export function parseAssistantCommand(text: string): ParsedAssistantCommand | null {
  const match = COMMAND_PATTERN.exec(text)
  if (!match) return null
  return {
    command: match[1]!.toLowerCase() as AssistantCommandName,
    memoryId: match[2]!,
  }
}

export function commandToMemoryPatch(
  cmd: ParsedAssistantCommand,
  now: Date = new Date(),
): Record<string, unknown> {
  switch (cmd.command) {
    case "reaffirm":
      return { lastReaffirmedAt: now.toISOString() }
    case "forget":
      return { lifecycleState: "forgotten", confirm: true }
    case "obsolete":
      return { lifecycleState: "cooling", validUntil: now.toISOString() }
    case "archive":
      return { lifecycleState: "archived" }
    case "restore":
      return { lifecycleState: "active" }
  }
}
