// @vitest-environment node
import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createRepositoryProvider, type DatabaseProvider } from "./provider"

/**
 * RLS enforcement guard. Skipped unless both env vars are set:
 *   RLS_TEST_ADMIN_URL — owner/admin connection (bypasses RLS) used to seed.
 *   RLS_TEST_APP_URL   — a NON-owner role (relay_app, bypassrls=false) used to
 *                        assert that policies actually bind.
 *
 * Run against a Neon branch where roles.sql has been applied (relay_app exists,
 * non-bypass). This proves two things the owner connection can never show:
 *   1. The provider's viewer path keeps the relay.current_user_id GUC and the
 *      query in the SAME transaction (the set_config(..., true) fix) — without
 *      it a legitimate read returns 0 rows under enforcement.
 *   2. Cross-tenant isolation holds: user B cannot see user A's project rows.
 */
const adminUrl = process.env.RLS_TEST_ADMIN_URL?.trim()
const appUrl = process.env.RLS_TEST_APP_URL?.trim()
const run = adminUrl && appUrl ? describe : describe.skip

const userA = randomUUID()
const userB = randomUUID()
const projectA = randomUUID()
const memoryA = randomUUID()

run("RLS enforcement under a non-owner role", () => {
  let admin: DatabaseProvider

  beforeAll(() => {
    admin = createRepositoryProvider(undefined, adminUrl)
  })

  afterAll(async () => {
    if (!admin) return
    await admin.query(`delete from memory_items where id = $1`, [memoryA])
    await admin.query(`delete from project_members where project_id = $1`, [projectA])
    await admin.query(`delete from projects where id = $1`, [projectA])
    await admin.query(`delete from profiles where id = $1 or id = $2`, [userA, userB])
  })

  it("seeds two users, a project owned by A, and one memory item", async () => {
    await admin.query(`insert into profiles (id) values ($1), ($2) on conflict do nothing`, [userA, userB])
    await admin.query(
      `insert into projects (id, owner_id, name, slug) values ($1, $2, 'rls-test', 'rls-test-slug')`,
      [projectA, userA],
    )
    await admin.query(
      `insert into project_members (project_id, user_id, role) values ($1, $2, 'owner')`,
      [projectA, userA],
    )
    await admin.query(
      `insert into memory_items (id, project_id, type, content, created_by) values ($1, $2, 'note', 'secret-A', $3)`,
      [memoryA, projectA, userA],
    )
  })

  it("owner A sees their own memory item under enforcement (GUC+query share a txn)", async () => {
    const asA = createRepositoryProvider(userA, appUrl)
    const rows = await asA.query<{ id: string }>(`select id from memory_items where project_id = $1`, [projectA])
    expect(rows.map((r) => r.id)).toContain(memoryA)
  })

  it("non-member B cannot see A's memory item (cross-tenant isolation)", async () => {
    const asB = createRepositoryProvider(userB, appUrl)
    const rows = await asB.query(`select id from memory_items where project_id = $1`, [projectA])
    expect(rows).toHaveLength(0)
  })

  it("the OLD bug repro: set_config in a separate statement loses the GUC -> 0 own rows", async () => {
    // Demonstrates why the provider fix matters: as a non-owner role, setting
    // the GUC transaction-locally and then querying in a SEPARATE autocommit
    // statement leaves current_relay_user_id() null, so even A's own read is denied.
    const raw = createRepositoryProvider(undefined, appUrl)
    await raw.query(`select set_config('relay.current_user_id', $1, true)`, [userA])
    const rows = await raw.query(`select id from memory_items where project_id = $1`, [projectA])
    expect(rows).toHaveLength(0)
  })
})
