import { createRepositoryBundle, createServiceRepositoryBundle, type RepositoryBundle } from "@relay/db"

import { revokeBillingSubscriptionsForAccountDeletion } from "./billing-service"

export async function deleteAccountRowsForUser(repositories: RepositoryBundle, userId: string) {
  // Better Auth stores user IDs as uuid columns in Neon Auth. Cast every auth
  // delete so a string server-action user ID cannot fail with uuid/text mismatch.
  await repositories.provider.query(`delete from neon_auth.session where "userId" = $1::uuid`, [userId])
  await repositories.provider.query(`delete from neon_auth.account where "userId" = $1::uuid`, [userId])
  await repositories.provider.query(
    `delete from neon_auth."user" where id = $1::uuid`,
    [userId],
  )
  await repositories.provider.query(`delete from profiles where id = $1`, [userId])
}

export async function deleteAccountForUser(userId: string) {
  await revokeBillingSubscriptionsForAccountDeletion(userId)

  const repositories = createServiceRepositoryBundle()
  await repositories.provider.transaction(async (provider) => {
    await deleteAccountRowsForUser(createRepositoryBundle(userId, provider), userId)
  })
}
