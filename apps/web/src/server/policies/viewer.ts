import { createRepositoryBundle } from "@relay/db"
import { hashContent } from "@relay/shared"
import { redirect } from "next/navigation"

import { requireAuthServer } from "@/lib/auth/server"
import { reconcileProfileForAuthUser } from "@/server/services/auth-sync-service"

export class AuthRequiredError extends Error {
  constructor(message = "Authentication is required.") {
    super(message)
    this.name = "AuthRequiredError"
  }
}

export interface Viewer {
  userId: string
  mode: "session" | "extension"
  email?: string | null
}

export type WebAuthIntent = "sign-in" | "sign-up"

interface SessionUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

async function upsertProfile(user: SessionUser) {
  if (user.email) {
    await reconcileProfileForAuthUser({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image
    })
  } else {
    const repositories = createRepositoryBundle(user.id)
    await repositories.profiles.upsert({
      id: user.id,
      email: null,
      displayName: user.name ?? null,
      avatarUrl: user.image ?? null
    })
  }
}

export async function requireSessionViewer(): Promise<Viewer> {
  const { data } = await requireAuthServer().getSession()
  const user = data?.user as SessionUser | undefined

  if (!user?.id) {
    throw new AuthRequiredError()
  }

  await upsertProfile(user)

  return {
    userId: user.id,
    mode: "session",
    email: user.email ?? null
  }
}

export async function resolveViewer(authorizationHeader?: string | null): Promise<Viewer> {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, "").trim()

  if (token) {
    const repositories = createRepositoryBundle()
    const tokenRecord = await repositories.extensionTokens.getValidByHash(hashContent(token))

    if (tokenRecord) {
      await repositories.extensionTokens.touch(tokenRecord.id)
      return {
        userId: tokenRecord.userId,
        mode: "extension",
        email: null
      }
    }
  }

  return requireSessionViewer()
}

export async function resolveOptionalViewer(authorizationHeader?: string | null): Promise<Viewer | null> {
  try {
    return await resolveViewer(authorizationHeader)
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return null
    }

    throw error
  }
}

export function isAuthRequiredError(error: unknown): error is AuthRequiredError {
  return error instanceof AuthRequiredError || (error instanceof Error && error.message === "Authentication is required.")
}

export function resolveWebAuthIntent(value: string | null | undefined): WebAuthIntent {
  return value === "sign-up" ? "sign-up" : "sign-in"
}

export function buildSignInHref(
  nextPath = "/dashboard",
  options: { intent?: WebAuthIntent } = {}
) {
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/dashboard"
  const params = new URLSearchParams({
    next: safeNextPath
  })

  if (options.intent === "sign-up") {
    params.set("intent", "sign-up")
  }

  return `/sign-in?${params.toString()}`
}

export function resolveSafeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/")) {
    return fallback
  }

  return value
}

export async function requirePageViewer(nextPath = "/dashboard"): Promise<Viewer> {
  try {
    return await requireSessionViewer()
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect(buildSignInHref(nextPath))
    }

    throw error
  }
}
