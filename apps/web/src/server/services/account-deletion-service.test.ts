import { describe, expect, it, vi } from "vitest"

import { deleteAccountRowsForUser } from "./account-deletion-service"

describe("deleteAccountRowsForUser", () => {
  it("deletes Neon Auth rows before the Relay profile", async () => {
    const query = vi.fn(async () => [])
    const repositories = {
      provider: { query },
    }

    await deleteAccountRowsForUser(repositories as never, "00000000-0000-4000-8000-000000000001")

    expect(query).toHaveBeenNthCalledWith(
      1,
      `delete from neon_auth.session where "userId" = $1::uuid`,
      ["00000000-0000-4000-8000-000000000001"],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      `delete from neon_auth.account where "userId" = $1::uuid`,
      ["00000000-0000-4000-8000-000000000001"],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      `delete from neon_auth."user" where id = $1::uuid`,
      ["00000000-0000-4000-8000-000000000001"],
    )
    expect(query).toHaveBeenNthCalledWith(
      4,
      `delete from profiles where id = $1`,
      ["00000000-0000-4000-8000-000000000001"],
    )
  })
})
