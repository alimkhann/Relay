import { createRepositoryBundle } from "@relay/db"
import { hashContent } from "@relay/shared"

import { requireAuthServer } from "@/lib/auth/server"

export interface Viewer {
  userId: string
  mode: "session" | "extension"
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
    throw new Error("Authentication is required.")
  }

  await upsertProfile(user)

  return {
    userId: user.id,
    mode: "session"
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
        mode: "extension"
      }
    }
  }

  return requireSessionViewer()
}
