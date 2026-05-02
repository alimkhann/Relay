import { randomBytes } from "node:crypto"

import { createRepositoryBundle } from "@relay/db"
import { extensionConnectCompleteSchema, extensionConnectStartSchema, extensionTokenInputSchema, hashContent } from "@relay/shared"

import { createExtensionTokenForUser } from "./extension-token-service"
import { getUserSettings } from "./settings-service"
import { listProjectsForUser } from "./project-service"

function buildGrantToken() {
  return `relay_grant_${randomBytes(24).toString("hex")}`
}

export async function startExtensionConnect(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = extensionConnectStartSchema.parse(input)
  const grantToken = buildGrantToken()
  const appUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"

  const record = await repositories.extensionConnectGrants.create({
    userId,
    deviceName: parsed.deviceName,
    grantHash: hashContent(grantToken),
    grantPrefix: grantToken.slice(0, 18),
    apiBase: appUrl,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  })

  return {
    grantToken,
    grantId: record.id,
    expiresAt: record.expiresAt,
    apiBase: appUrl
  }
}

export async function completeExtensionConnect(input: unknown) {
  const parsed = extensionConnectCompleteSchema.parse(input)
  const repositories = createRepositoryBundle()
  const grant = await repositories.extensionConnectGrants.getValidByHash(hashContent(parsed.grantToken))

  if (!grant) {
    throw new Error("Pairing grant is invalid or expired.")
  }

  const tokenResult = await createExtensionTokenForUser(grant.userId, extensionTokenInputSchema.parse({ deviceName: grant.deviceName }))
  await repositories.extensionConnectGrants.consume(grant.id)

  const [projects, settings] = await Promise.all([listProjectsForUser(grant.userId), getUserSettings(grant.userId)])

  return {
    token: tokenResult.token,
    apiBase: grant.apiBase,
    projects,
    settings,
    projectId: projects[0]?.id ?? "",
    targetProfileKey: settings.settings.defaultTargetProfileKey
  }
}
