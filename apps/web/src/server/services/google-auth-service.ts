import { createRepositoryBundle } from "@relay/db"

import { requireAuthServer } from "@/lib/auth/server"
import { logServerEvent } from "@/server/logging/logger"
import { reconcileProfileForAuthUser } from "./auth-sync-service"

export interface NeonAuthUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  isNewUser?: boolean
}

export interface GoogleUserInfo {
  sub: string
  email: string
  name?: string
  picture?: string
  email_verified?: boolean
}

export function extractAuthUser(value: unknown): NeonAuthUser | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const candidate = value as {
    id?: unknown
    email?: unknown
    name?: unknown
    image?: unknown
  }

  if (typeof candidate.id !== "string" || typeof candidate.email !== "string") {
    return null
  }

  return {
    id: candidate.id,
    email: candidate.email,
    name: typeof candidate.name === "string" ? candidate.name : null,
    image: typeof candidate.image === "string" ? candidate.image : null
  }
}

export async function verifyGoogleIdentity(googleAccessToken: string) {
  const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${googleAccessToken}` }
  })

  if (!userInfoResponse.ok) {
    throw new Error("Invalid Google access token.")
  }

  const googleUser = (await userInfoResponse.json()) as GoogleUserInfo
  if (!googleUser.email || !googleUser.sub) {
    throw new Error("Google account is missing required identity fields.")
  }

  return googleUser
}

async function ensureGoogleAccountLink(input: {
  userId: string
  googleAccountId: string
}) {
  const repositories = createRepositoryBundle()
  const existingAccountRows = await repositories.provider.query<{ id: string }>(
    `select id
     from neon_auth.account
     where "providerId" = 'google'
       and "accountId" = $1
     limit 1`,
    [input.googleAccountId]
  )

  const existingAccountId = existingAccountRows[0]?.id

  if (existingAccountId) {
    await repositories.provider.query(
      `update neon_auth.account
       set "userId" = $2::uuid,
           "updatedAt" = now()
        where id = $1`,
      [existingAccountId, input.userId]
    )
    return
  }

  await repositories.provider.query(
    `insert into neon_auth.account (
       "accountId",
       "providerId",
       "userId",
       "createdAt",
       "updatedAt"
     )
     values ($1, 'google', $2::uuid, now(), now())`,
    [input.googleAccountId, input.userId]
  )
}

export async function resolveOrProvisionAuthUser(input: {
  googleUser: GoogleUserInfo
}) {
  const repositories = createRepositoryBundle()
  let isNewUser = false

  const linkedAccountRows = await repositories.provider.query<{
    id: string
    email: string
    name: string | null
    image: string | null
  }>(
    `select u.id, u.email, u.name, u.image
     from neon_auth.account a
     join neon_auth."user" u on u.id = a."userId"
     where a."providerId" = 'google'
       and a."accountId" = $1
     limit 1`,
    [input.googleUser.sub]
  )

  let userId = linkedAccountRows[0]?.id ?? null

  if (!userId) {
    const emailRows = await repositories.provider.query<{
      id: string
      email: string
      name: string | null
      image: string | null
    }>(
      `select id, email, name, image
       from neon_auth."user"
       where email = $1
       limit 1`,
      [input.googleUser.email]
    )
    userId = emailRows[0]?.id ?? null
  }

  if (!userId) {
    const insertedRows = await repositories.provider.query<{
      id: string
      email: string
      name: string | null
      image: string | null
    }>(
      `insert into neon_auth."user" (
         name,
         email,
         "emailVerified",
         image,
         "createdAt",
         "updatedAt"
       )
       values ($1, $2, $3, $4, now(), now())
       returning id, email, name, image`,
      [
        input.googleUser.name ?? input.googleUser.email,
        input.googleUser.email,
        Boolean(input.googleUser.email_verified),
        input.googleUser.picture ?? null
      ]
    )
    userId = insertedRows[0]?.id ?? null
    isNewUser = true
  } else {
    await repositories.provider.query(
      `update neon_auth."user"
       set name = $2,
           email = $3,
           "emailVerified" = $4,
           image = $5,
           "updatedAt" = now()
       where id = $1::uuid`,
      [
        userId,
        input.googleUser.name ?? input.googleUser.email,
        input.googleUser.email,
        Boolean(input.googleUser.email_verified),
        input.googleUser.picture ?? null
      ]
    )
  }

  if (!userId) {
    throw new Error("Failed to provision a Neon Auth user for Google sign-in.")
  }

  await ensureGoogleAccountLink({
    userId,
    googleAccountId: input.googleUser.sub
  })

  return {
    id: userId,
    email: input.googleUser.email,
    name: input.googleUser.name ?? null,
    image: input.googleUser.picture ?? null,
    isNewUser,
  } satisfies NeonAuthUser
}

export async function resolveGoogleAuthUser(input: {
  googleAccessToken: string
  googleIdToken: string
  flowId?: string
  allowProvisionFallback?: boolean
}) {
  const googleUser = await verifyGoogleIdentity(input.googleAccessToken)
  let authUser: NeonAuthUser | null = null
  let isNewUser = false

  try {
    const signInResult = await requireAuthServer().signIn.social({
      provider: "google",
      disableRedirect: true,
      requestSignUp: true,
      idToken: {
        token: input.googleIdToken,
        accessToken: input.googleAccessToken
      }
    })

    if (!signInResult.error) {
      authUser = extractAuthUser((signInResult.data as { user?: unknown } | null)?.user)
    } else if (input.flowId) {
      await logServerEvent({
        level: "warn",
        surface: "web-api",
        area: "auth",
        event: "google_auth.neon_social_failed",
        flowId: input.flowId,
        message: signInResult.error.message ?? "Neon Auth social sign-in failed.",
        context: {
          googleEmail: googleUser.email
        }
      })
    }
  } catch (error) {
    if (input.flowId) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "google_auth.neon_social_exception",
        flowId: input.flowId,
        message: "Neon Auth social sign-in threw an exception.",
        context: {
          googleEmail: googleUser.email
        },
        error
      })
    }
  }

  if (!authUser && input.allowProvisionFallback) {
    authUser = await resolveOrProvisionAuthUser({
      googleUser
    })
    isNewUser = "isNewUser" in authUser ? Boolean((authUser as NeonAuthUser & { isNewUser?: boolean }).isNewUser) : false
  }

  if (!authUser) {
    throw new Error("Google sign-in did not establish a Relay auth session.")
  }

  await reconcileProfileForAuthUser(authUser)

  return {
    authUser,
    googleUser,
    isNewUser,
  }
}
