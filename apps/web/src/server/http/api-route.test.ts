import { beforeEach, describe, expect, it, vi } from "vitest"

const { logServerEventMock } = vi.hoisted(() => ({
  logServerEventMock: vi.fn(),
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: logServerEventMock,
}))

vi.mock("@/lib/telemetry/posthog-server", () => ({
  captureServerException: vi.fn(),
}))

vi.mock("@/server/policies/viewer", () => ({
  isAuthRequiredError: vi.fn(() => false),
}))

import { withApiRoute } from "./api-route"

describe("withApiRoute validation logging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("downgrades authenticated extension validation failures to debug", async () => {
    const handler = withApiRoute(async () => {
      throw { issues: [{ path: ["projectId"], message: "Invalid project." }] }
    })

    const response = await handler(
      new Request("https://www.onrelay.app/api/extension/bindings", {
        method: "POST",
        headers: { authorization: "Bearer token" },
      }),
    )

    expect(response.status).toBe(400)
    expect(logServerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api.validation_failed",
        level: "debug",
      }),
    )
  })

  it("keeps authenticated non-extension validation failures as warnings", async () => {
    const handler = withApiRoute(async () => {
      throw { issues: [{ path: ["projectId"], message: "Invalid project." }] }
    })

    const response = await handler(
      new Request("https://www.onrelay.app/api/projects", {
        method: "POST",
        headers: { authorization: "Bearer token" },
      }),
    )

    expect(response.status).toBe(400)
    expect(logServerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "api.validation_failed",
        level: "warn",
      }),
    )
  })
})
