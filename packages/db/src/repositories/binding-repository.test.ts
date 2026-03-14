import { describe, expect, it, vi } from "vitest"

import type { DatabaseProvider } from "../store/provider"
import { BindingRepository } from "./binding-repository"

function createProvider(rows: Array<Record<string, unknown>> = []): DatabaseProvider {
  const query: DatabaseProvider["query"] = async (text) => {
    if (text.includes("coalesce(platform, '')")) {
      throw new Error("enum-unsafe platform comparison")
    }

    return rows as never[]
  }

  return {
    mode: "local",
    query: vi.fn(query) as DatabaseProvider["query"],
  }
}

describe("BindingRepository.resolve", () => {
  it("uses enum-safe platform matching and returns null when there is no binding", async () => {
    const provider = createProvider()
    const repository = new BindingRepository(provider)

    await expect(
      repository.resolve("user_123", {
        domain: "chatgpt.com",
        tabId: "321",
        platform: "chatgpt",
      }),
    ).resolves.toBeNull()

    expect(provider.query).toHaveBeenCalledTimes(1)
    expect(provider.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "platform is not distinct from cast($4 as platform_type)",
      ),
      ["user_123", "321", "chatgpt.com", "chatgpt"],
    )
  })

  it("maps a null-platform domain binding without throwing", async () => {
    const provider = createProvider([
      {
        id: "binding_1",
        user_id: "user_123",
        project_id: "project_123",
        binding_kind: "domain",
        domain: "chatgpt.com",
        tab_id: null,
        platform: null,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      },
    ])
    const repository = new BindingRepository(provider)

    await expect(
      repository.resolve("user_123", {
        domain: "chatgpt.com",
        tabId: null,
        platform: null,
      }),
    ).resolves.toMatchObject({
      id: "binding_1",
      projectId: "project_123",
      bindingKind: "domain",
      domain: "chatgpt.com",
      platform: null,
    })
  })
})
