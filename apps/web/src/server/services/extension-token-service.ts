import { randomBytes } from "node:crypto"

import { createRepositoryBundle } from "@relay/db"
import { extensionTokenInputSchema, hashContent } from "@relay/shared"

function buildToken() {
  return `relay_${randomBytes(24).toString("hex")}`
}

export async function createExtensionTokenForUser(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = extensionTokenInputSchema.parse(input)
  const purpose = parsed.purpose ?? "manual"
  const token = buildToken()
  const record = await repositories.extensionTokens.create({
    userId,
    deviceName: parsed.deviceName,
    purpose,
    tokenHash: hashContent(token),
    tokenPrefix: token.slice(0, 12)
  })

  await repositories.extensionTokens.revokeOlderDuplicates(
    userId,
    parsed.deviceName,
    purpose,
    record.id
  )

  return {
    token,
    record
  }
}

export async function listExtensionTokensForUser(userId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.extensionTokens.listByUser(userId)
}

export async function revokeExtensionTokenForUser(userId: string, tokenId: string) {
  const repositories = createRepositoryBundle(userId)
  await repositories.extensionTokens.revoke(userId, tokenId)
}
