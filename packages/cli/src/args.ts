export interface ParsedArgs {
  command: string | null
  subcommand: string | null
  positionals: string[]
  flags: Record<string, string | boolean>
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = null, subcommand = null, ...rest] = argv
  const positionals: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg) continue

    if (!arg.startsWith("-")) {
      positionals.push(arg)
      continue
    }

    if (arg.startsWith("--")) {
      const [key, inlineValue] = arg.slice(2).split("=", 2)
      if (!key) continue

      if (inlineValue !== undefined) {
        flags[key] = inlineValue
        continue
      }

      const next = rest[index + 1]
      if (next && !next.startsWith("-")) {
        flags[key] = next
        index += 1
      } else {
        flags[key] = true
      }
      continue
    }

    const shortFlags = arg.slice(1).split("")
    for (const shortFlag of shortFlags) {
      if (!shortFlag) continue
      flags[shortFlag] = true
    }
  }

  return { command, subcommand, positionals, flags }
}

export function getStringFlag(flags: ParsedArgs["flags"], ...names: string[]): string | undefined {
  for (const name of names) {
    const value = flags[name]
    if (typeof value === "string") {
      return value
    }
  }

  return undefined
}

export function hasFlag(flags: ParsedArgs["flags"], ...names: string[]): boolean {
  return names.some((name) => Boolean(flags[name]))
}
