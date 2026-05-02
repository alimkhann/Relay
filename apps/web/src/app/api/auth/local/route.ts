import { NextResponse } from "next/server"

import { createFlowId } from "@relay/shared"

import { applyLocalSessionCookie } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { logServerEvent } from "@/server/logging/logger"
import { getRequestContext, withRequestContext } from "@/server/logging/request-context"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { resolveOrCreateLocalAuthUser } from "@/server/services/local-auth-service"

function withRequestId(response: NextResponse) {
  const requestId = getRequestContext()?.requestId ?? createFlowId("req")
  response.headers.set("x-relay-request-id", requestId)
  return response
}

export async function POST(request: Request) {
  return withRequestContext(request, async () => {
    if (getAuthProvider() !== "local") {
      return withRequestId(
        NextResponse.json({ error: "Local auth is not enabled." }, { status: 404 })
      )
    }

    const flowId = request.headers.get("x-relay-flow-id") ?? createFlowId("local-auth")
    let authIntent: "sign-in" | "sign-up" = "sign-in"

    try {
      await assertIpRateLimit(request, "local_auth_ip", 5)
      const body = (await request.json()) as {
        email?: string
        name?: string | null
        intent?: "sign-in" | "sign-up"
      }
      authIntent = body.intent ?? "sign-in"
      const user = await resolveOrCreateLocalAuthUser({
        email: body.email,
        name: body.name ?? null,
      })

      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "auth",
        event: "sign_in_completed",
        flowId,
        message: `Signed in locally as ${user.email}.`,
        userId: user.id,
        context: {
          authMethod: "local",
          authIntent,
          isNewUser: user.isNewUser,
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
            authIntent,
          },
        })
      }

      return withRequestId(
        applyLocalSessionCookie(
          NextResponse.json({
            ok: true,
            user,
          }),
          user
        )
      )
    } catch (error) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "sign_in_failed",
        flowId,
        message: "Local sign-in failed.",
        context: {
          authMethod: "local",
          authIntent,
        },
        error,
      })

      return withRequestId(
        NextResponse.json(
          {
            error: error instanceof Error ? error.message : "Local sign-in failed.",
          },
          { status: 400 }
        )
      )
    }
  })
}
