import { createRepositoryBundle } from "@relay/db"
import { hashContent } from "@relay/shared"

import { requireAuthServer } from "@/lib/auth/server"

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

interface SessionUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

async function upsertProfile(user: SessionUser) {
  const repositories = createRepositoryBundle(user.id)
  await repositories.profiles.upsert({
    id: user.id,
    email: user.email ?? null,
    displayName: user.name ?? null,
    avatarUrl: user.image ?? null
  })
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
