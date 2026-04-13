import { readFile } from "node:fs/promises"

export interface RelayNativeScenario {
  id: string
  category: "browser_to_agent" | "current_vs_historical" | "locked_conflict" | "project_status"
  prompt: string
  expectedSignals: string[]
}

export async function loadRelayNativeScenarios(path: string): Promise<RelayNativeScenario[]> {
  const raw = await readFile(path, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error("Relay-native scenario file must be an array")
  }

  return parsed.map((item, index) => {
    const scenario = item as Partial<RelayNativeScenario>
    if (!scenario.id || !scenario.category || !scenario.prompt || !Array.isArray(scenario.expectedSignals)) {
      throw new Error(`Invalid relay-native scenario at index ${index}`)
    }
    return {
      id: scenario.id,
      category: scenario.category,
      prompt: scenario.prompt,
      expectedSignals: scenario.expectedSignals,
    }
  })
}
