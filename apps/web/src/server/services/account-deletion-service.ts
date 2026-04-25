import type { RepositoryBundle } from "@relay/db"

export async function deleteAccountRowsForUser(repositories: RepositoryBundle, userId: string) {
  // Deleting the Neon Auth user first. Since Better Auth doesn't strictly cascade,
  // we must delete sessions and accounts beforehand alongside the Relay profile.
  await repositories.provider.query(`delete from neon_auth.session where "userId" = $1`, [userId])
  await repositories.provider.query(`delete from neon_auth.account where "userId" = $1`, [userId])
  await repositories.provider.query(
    `delete from neon_auth."user" where id = $1::uuid`,
    [userId],
  )
  await repositories.provider.query(`delete from profiles where id = $1`, [userId])
}
