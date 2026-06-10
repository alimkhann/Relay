import { NextResponse } from "next/server"

import { createFlowId } from "@relay/shared"

import { getAuthProvider } from "@/lib/auth/provider"
import { applyExtensionCorsHeaders, buildExtensionPreflightResponse } from "@/server/http/extension-cors"
import { logServerEvent } from "@/server/logging/logger"
import { getRequestContext, withRequestContext } from "@/server/logging/request-context"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { resolveOrCreateLocalAuthUser } from "@/server/services/local-auth-service"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { ensurePersonalProjectForUser, listProjectsForUser } from "@/server/services/project-service"
import { getUserSettings } from "@/server/services/settings-service"
import { createExtensionTokenForUser } from "@/server/services/extension-token-service"
import { resolveExtensionSelectedProjectId } from "@/server/services/extension-project-selection"

function withRequestId(response: NextResponse) {
  const requestId = getRequestContext()?.requestId ?? createFlowId("req")
  response.headers.set("x-relay-request-id", requestId)
  return response
}

export function OPTIONS(request: Request) {
  return buildExtensionPreflightResponse(request.headers.get("origin"))
}

export async function POST(request: Request) {
  return withRequestContext(request, async () => {
    if (getAuthProvider() !== "local") {
      return applyExtensionCorsHeaders(
        withRequestId(
        NextResponse.json({ error: "Local auth is not enabled." }, { status: 404 })
        ),
        request.headers.get("origin")
      )
    }

    const flowId =
      request.headers.get("x-relay-flow-id") ??
      getRequestContext()?.flowId ??
      createFlowId("ext-local-auth")

    try {
      await assertIpRateLimit(request, "extension_local_auth_ip", 5)
      const body = (await request.json()) as {
        email?: string
        name?: string | null
        deviceName?: string
      }
      const user = await resolveOrCreateLocalAuthUser({
        email: body.email,
        name: body.name ?? null,
      })
      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "auth",
        event: "extension_auth_completed",
        flowId,
        message: `Completed extension local auth for ${user.email}.`,
        userId: user.id,
        context: {
          authMethod: "local",
          isNewUser: user.isNewUser,
          deviceName: body.deviceName ?? "Chrome Extension",
        },
      })
      if (user.isNewUser) {
        await logServerEvent({
          level: "info",
          surface: "web-api",
          area: "auth",
          event: "account_created",
          flowId,
          message: `Created a new local account for ${user.email}.`,
          userId: user.id,
          context: {
            authMethod: "local",
          },
        })
      }
      const tokenResult = await createExtensionTokenForUser(user.id, {
        deviceName: body.deviceName || "Chrome Extension",
      })

      await ensurePersonalProjectForUser(user.id)
      const [projects, settings, onboarding] = await Promise.all([
        listProjectsForUser(user.id, { includePersonal: true }),
        getUserSettings(user.id),
        getResolvedOnboardingStateForUser(user.id),
      ])

      const appUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"
      const selectedProjectId = resolveExtensionSelectedProjectId(projects, onboarding)

      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "auth",
        event: "extension_local_auth.succeeded",
        flowId,
        message: `Issued a local extension session for ${user.email}.`,
        userId: user.id,
        projectId: selectedProjectId || null,
        context: {
          projectCount: projects.length,
          onboardingStatus: onboarding.status,
        },
      })

      return applyExtensionCorsHeaders(
        withRequestId(
          NextResponse.json(
            {
              token: tokenResult.token,
              apiBase: appUrl,
              userId: user.id,
              projects,
              settings,
              onboarding,
              projectId: selectedProjectId,
              targetProfileKey: settings.settings.defaultTargetProfileKey,
            },
            { status: 201 }
          )
        ),
        request.headers.get("origin")
      )
    } catch (error) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "extension_auth_failed",
        flowId,
        message: "Local sign-in for extension failed.",
        context: {
          authMethod: "local",
        },
        error,
      })
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "extension_local_auth.failed",
        flowId,
        message: "Local sign-in for extension failed.",
        error,
      })

      return applyExtensionCorsHeaders(
        withRequestId(
          NextResponse.json(
            {
              error: error instanceof Error ? error.message : "Local sign-in for extension failed.",
            },
            { status: 400 }
          )
        ),
        request.headers.get("origin")
      )
    }
  })
}
