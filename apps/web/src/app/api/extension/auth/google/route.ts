import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { createExtensionTokenForUser } from "@/server/services/extension-token-service"
import { getUserSettings } from "@/server/services/settings-service"
import { listProjectsForUser } from "@/server/services/project-service"

interface GoogleUserInfo {
  sub: string
  email: string
  name?: string
  picture?: string
  email_verified?: boolean
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { googleAccessToken?: string; deviceName?: string }

    if (!body.googleAccessToken) {
      return NextResponse.json({ error: "googleAccessToken is required." }, { status: 400 })
    }

    // Verify the Google access token and get user info
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${body.googleAccessToken}` }
    })

    if (!userInfoResponse.ok) {
      return NextResponse.json({ error: "Invalid Google access token." }, { status: 401 })
    }

    const googleUser = (await userInfoResponse.json()) as GoogleUserInfo
    if (!googleUser.email) {
      return NextResponse.json({ error: "Google account has no email." }, { status: 400 })
    }

    // Find the user by email in the profiles table
    const repositories = createRepositoryBundle()
    const profileRows = await repositories.provider.query<{ id: string }>(
      `select id from profiles where email = $1 limit 1`,
      [googleUser.email]
    )

    let userId = profileRows[0]?.id

    if (!userId) {
      // Look up in the Neon Auth user table as fallback
      const userRows = await repositories.provider.query<{ id: string }>(
        `select id from "user" where email = $1 limit 1`,
        [googleUser.email]
      )

      userId = userRows[0]?.id

      if (userId) {
        // Create a profile entry for this user
        await repositories.profiles.upsert({
          id: userId,
          email: googleUser.email,
          displayName: googleUser.name ?? null,
          avatarUrl: googleUser.picture ?? null
        })
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "No Relay account found for this Google account. Please sign in on the web first." },
        { status: 404 }
      )
    }

    // Create a device token for the extension
    const tokenResult = await createExtensionTokenForUser(userId, {
      deviceName: body.deviceName || "Chrome Extension"
    })

    const [projects, settings] = await Promise.all([
      listProjectsForUser(userId),
      getUserSettings(userId)
    ])

    const appUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"

    return NextResponse.json(
      {
        token: tokenResult.token,
        apiBase: appUrl,
        projects,
        settings,
        projectId: projects[0]?.id ?? "",
        targetProfileKey: settings.settings.defaultTargetProfileKey
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google sign-in for extension failed." },
      { status: 500 }
    )
  }
}
