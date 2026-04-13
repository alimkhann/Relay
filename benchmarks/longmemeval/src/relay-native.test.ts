import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { loadRelayNativeScenarios } from "./relay-native"

describe("loadRelayNativeScenarios", () => {
  it("loads valid relay-native scenarios", async () => {
    const dir = resolve(process.cwd(), "benchmarks/longmemeval/.tmp-relay-native-test")
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const file = resolve(dir, "scenarios.json")
    writeFileSync(file, JSON.stringify([
      {
        id: "scenario-1",
        category: "browser_to_agent",
        prompt: "What is the current objective?",
        expectedSignals: ["objective", "recent progress"],
      },
    ]))

    const scenarios = await loadRelayNativeScenarios(file)
    expect(scenarios).toHaveLength(1)
    expect(scenarios[0]?.category).toBe("browser_to_agent")

    rmSync(dir, { recursive: true, force: true })
  })
})
