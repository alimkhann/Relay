import { beforeEach, describe, expect, it, vi } from "vitest"

const posthogMock = {
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  reset: vi.fn(),
  get_property: vi.fn(),
  get_session_id: vi.fn(),
}

vi.mock("posthog-js", () => ({
  default: posthogMock,
}))

describe("posthog identity helpers", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "test_posthog_key"
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com"
  })

  it("identifies the user with enriched person properties", async () => {
    const { identifyPosthogUser } = await import("./posthog")

    identifyPosthogUser("user-123", {
      email: "user@example.com",
      plan: "starter",
      created_at: "2026-04-20T00:00:00.000Z",
      is_extension_installed: true,
    })

    expect(posthogMock.init).toHaveBeenCalledTimes(1)
    expect(posthogMock.identify).toHaveBeenCalledWith("user-123", {
      email: "user@example.com",
      plan: "starter",
      created_at: "2026-04-20T00:00:00.000Z",
      is_extension_installed: true,
    })
    expect(posthogMock.register).toHaveBeenCalledWith({
      user_id: "user-123",
      plan: "starter",
      is_authenticated: true,
      is_extension_installed: true,
    })
  })

  it("resets the user and clears registered analytics identity fields", async () => {
    const { resetPosthogUser } = await import("./posthog")

    resetPosthogUser()

    expect(posthogMock.init).toHaveBeenCalledTimes(1)
    expect(posthogMock.reset).toHaveBeenCalledTimes(1)
    expect(posthogMock.register).toHaveBeenCalledWith({
      user_id: null,
      plan: null,
      is_authenticated: false,
      is_extension_installed: null,
    })
  })
})
