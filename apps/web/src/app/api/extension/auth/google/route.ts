import { NextResponse } from "next/server"

import { createFlowId } from "@relay/shared"

import { logServerEvent } from "@/server/logging/logger"
import { getRequestContext, withRequestContext } from "@/server/logging/request-context"
import { resolveGoogleAuthUser } from "@/server/services/google-auth-service"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { listProjectsForUser } from "@/server/services/project-service"
import { getUserSettings } from "@/server/services/settings-service"
import { createExtensionTokenForUser } from "@/server/services/extension-token-service"

function withRequestId(response: NextResponse) {
  const requestId = getRequestContext()?.requestId ?? createFlowId("req")
  response.headers.set("x-relay-request-id", requestId)
  return response
}

export async function POST(request: Request) {
  return withRequestContext(request, async () => {
    const flowId =
      request.headers.get("x-relay-flow-id") ??
      getRequestContext()?.flowId ??
      createFlowId("ext-auth")

    try {
      const body = (await request.json()) as {
        googleAccessToken?: string
        googleIdToken?: string
        deviceName?: string
      }

      if (!body.googleAccessToken || !body.googleIdToken) {
        await logServerEvent({
          level: "warn",
          surface: "web-api",
          area: "auth",
          event: "extension_google_auth.tokens_missing",
          flowId,
          message: "Extension Google auth request was missing Google OAuth tokens."
        })
        return withRequestId(
          NextResponse.json({ error: "googleAccessToken and googleIdToken are required." }, { status: 400 })
        )
      }

      const { authUser, googleUser } = await resolveGoogleAuthUser({
        googleAccessToken: body.googleAccessToken,
        googleIdToken: body.googleIdToken,
        flowId,
        allowProvisionFallback: true
      })

      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "auth",
        event: "extension_google_auth.identity_verified",
        flowId,
        message: `Verified Google identity for ${googleUser.email}.`,
        userId: authUser.id,
        context: {
          deviceName: body.deviceName ?? "Chrome Extension"
        }
      })

      const tokenResult = await createExtensionTokenForUser(authUser.id, {
        deviceName: body.deviceName || "Chrome Extension"
      })

      const [projects, settings, onboarding] = await Promise.all([
        listProjectsForUser(authUser.id),
        getUserSettings(authUser.id),
        getResolvedOnboardingStateForUser(authUser.id)
      ])

      const appUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"
      const selectedProjectId =
        onboarding.status === "completed"
          ? onboarding.completedProjectId ?? projects[0]?.id ?? ""
          : ""

      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "auth",
        event: "extension_google_auth.succeeded",
        flowId,
        message: "Issued an extension session after Google auth.",
        userId: authUser.id,
        projectId: selectedProjectId || null,
        context: {
          projectCount: projects.length,
          onboardingStatus: onboarding.status
        }
      })

      return withRequestId(
        NextResponse.json(
          {
            token: tokenResult.token,
            apiBase: appUrl,
            projects,
            settings,
            onboarding,
            projectId: selectedProjectId,
            targetProfileKey: settings.settings.defaultTargetProfileKey
          },
          { status: 201 }
        )
      )
    } catch (error) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "extension_google_auth.failed",
        flowId,
        message: "Google sign-in for extension failed on the server.",
        error
      })
      return withRequestId(
        NextResponse.json(
          {
            error: error instanceof Error ? error.message : "Google sign-in for extension failed."
          },
          { status: 500 }
        )
      )
    }
  })
}
