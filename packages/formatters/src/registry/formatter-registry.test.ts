import { describe, expect, it } from "vitest"

import { getFormatter } from "./formatter-registry"

describe("formatter registry", () => {
  it("returns the codex formatter", () => {
    const formatter = getFormatter("codex_implementation")

    expect(formatter.key).toBe("codex_implementation")
  })
})
