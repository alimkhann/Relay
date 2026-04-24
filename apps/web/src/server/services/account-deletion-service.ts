import type { RepositoryBundle } from "@relay/db"

export async function deleteAccountRowsForUser(repositories: RepositoryBundle, userId: string) {
  // Deleting the Neon Auth user first cascades auth accounts and sessions.
  // Deleting the Relay profile then cascades public Relay-owned data.
  await repositories.provider.query(
    `delete from neon_auth."user" where id = $1::uuid`,
    [userId],
  )
  await repositories.provider.query(`delete from profiles where id = $1`, [userId])
}
