import { describe, expect, it, vi } from "vitest"

const createRepositoryBundle = vi.fn(() => {
  throw new Error("health check opened database")
})

vi.mock("@relay/db", () => ({
  createRepositoryBundle,
}))

vi.mock("@/server/http/api-route", () => ({
  withApiRoute: (handler: (request: Request) => Promise<Response>) => handler,
}))

describe("GET /api/health", () => {
  it("returns public app health without opening the database", async () => {
    const { GET } = await import("./route")

    const response = await GET(new Request("https://www.onrelay.app/api/health"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.status).toBe("ok")
    expect(payload.checks).toEqual({ app: "ok" })
    expect(createRepositoryBundle).not.toHaveBeenCalled()
  })
})
