import { describe, expect, it } from "vitest"

import { projectInputSchema } from "./project"

describe("projectInputSchema", () => {
  it("accepts nullable http project URLs", () => {
    expect(projectInputSchema.parse({
      name: "Relay",
      description: null,
      projectUrl: "https://www.onrelay.app",
    }).projectUrl).toBe("https://www.onrelay.app")

    expect(projectInputSchema.parse({
      name: "Relay",
      projectUrl: null,
    }).projectUrl).toBeNull()
  })

  it("rejects non-http project URLs", () => {
    expect(() => projectInputSchema.parse({
      name: "Relay",
      projectUrl: "file:///tmp/relay.html",
    })).toThrow()
  })
})
