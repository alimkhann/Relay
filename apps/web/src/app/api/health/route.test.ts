import { beforeEach, describe, expect, it, vi } from "vitest"

const providerQuery = vi.fn()
const createRepositoryBundle = vi.fn(() => ({
  provider: {
    query: providerQuery,
  },
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle,
}))

vi.mock("@/server/http/api-route", () => ({
  withApiRoute: (handler: (request: Request) => Promise<Response>) => handler,
}))

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("returns public app health without opening the database", async () => {
    const { GET } = await import("./route")

    const response = await GET(new Request("https://www.onrelay.app/api/health"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.status).toBe("ok")
    expect(payload.checks).toEqual({ app: "ok" })
    expect(createRepositoryBundle).not.toHaveBeenCalled()
  })

  it("allows deep database health with a normalized internal secret", async () => {
    vi.stubEnv("RELAY_INTERNAL_API_SECRET", " secret-with-whitespace ")
    const { GET } = await import("./route")

    const response = await GET(new Request("https://www.onrelay.app/api/health?deep=1", {
      headers: {
        "x-relay-internal-secret": "secret-with-whitespace",
      },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.checks).toEqual({ app: "ok", database: "ok" })
    expect(providerQuery).toHaveBeenCalledWith("select 1")
  })
})
