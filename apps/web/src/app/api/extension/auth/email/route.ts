import { NextResponse } from "next/server"

import { createFlowId } from "@relay/shared"

import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"
import { applyExtensionCorsHeaders, buildExtensionPreflightResponse } from "@/server/http/extension-cors"
import { logServerEvent } from "@/server/logging/logger"
import { getRequestContext, withRequestContext } from "@/server/logging/request-context"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { extractAuthUser } from "@/server/services/google-auth-service"
import { reconcileProfileForAuthUser } from "@/server/services/auth-sync-service"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { listProjectsForUser } from "@/server/services/project-service"
import { getUserSettings } from "@/server/services/settings-service"
import { createExtensionTokenForUser } from "@/server/services/extension-token-service"

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
    if (getAuthProvider() !== "neon") {
      return applyExtensionCorsHeaders(
        withRequestId(
          NextResponse.json({ error: "Email auth is not enabled." }, { status: 404 })
        ),
        request.headers.get("origin")
      )
    }

    const flowId =
      request.headers.get("x-relay-flow-id") ??
      getRequestContext()?.flowId ??
      createFlowId("ext-email-auth")

    try {
      await assertIpRateLimit(request, "extension_email_auth_ip", 5)
      const body = (await request.json()) as {
        email?: string
        password?: string
        name?: string | null
        intent?: "sign-in" | "sign-up"
        otp?: string | null
        resendOnly?: boolean
        deviceName?: string
      }

      if (!body.email || !body.password) {
        return applyExtensionCorsHeaders(
          withRequestId(
            NextResponse.json({ error: "Email and password are required." }, { status: 400 })
          ),
          request.headers.get("origin")
        )
      }

      const auth = requireAuthServer()
      const intent = body.intent ?? "sign-in"
      const email = body.email!
      const password = body.password!
      let authResult: { data: unknown; error: { message?: string } | null }

      if (intent === "sign-up") {
        if (!body.otp) {
          if (!body.resendOnly) {
            authResult = await auth.signUp.email({
              email,
              password,
              name: body.name || email.split("@")[0] || email,
            })

            if (authResult.error) {
              await logServerEvent({
                level: "warn",
                surface: "web-api",
                area: "auth",
                event: "extension_email_sign-up.rejected",
                flowId,
                message: authResult.error.message ?? "Email sign-up rejected by auth server.",
                context: { authMethod: "email", intent },
              })
              return applyExtensionCorsHeaders(
                withRequestId(
                  NextResponse.json(
                    { error: authResult.error.message ?? "Email sign-up failed." },
                    { status: 401 }
                  )
                ),
                request.headers.get("origin")
              )
            }
          }

          const otpResult = await auth.emailOtp.sendVerificationOtp({
            email,
            type: "email-verification",
          })

          if (otpResult.error) {
            await logServerEvent({
              level: "warn",
              surface: "web-api",
              area: "auth",
              event: "extension_email_signup_otp.rejected",
              flowId,
              message: otpResult.error.message ?? "Could not send extension signup OTP.",
              context: { authMethod: "email", intent },
            })
            return applyExtensionCorsHeaders(
              withRequestId(
                NextResponse.json(
                  { error: otpResult.error.message ?? "Could not send verification code." },
                  { status: 500 }
                )
              ),
              request.headers.get("origin")
            )
          }

          await logServerEvent({
            level: "info",
            surface: "web-api",
            area: "auth",
            event: "extension_email_signup_otp.sent",
            flowId,
            message: `Sent extension email sign-up OTP to ${email}.`,
            context: { authMethod: "email", intent },
          })

          return applyExtensionCorsHeaders(
            withRequestId(
              NextResponse.json(
                {
                  requiresOtp: true,
                  message: "Enter the verification code sent to your email.",
                },
                { status: 202 }
              )
            ),
            request.headers.get("origin")
          )
        }

        const verifyResult = await auth.emailOtp.verifyEmail({
          email,
          otp: body.otp,
        })

        if (verifyResult.error) {
          await logServerEvent({
            level: "warn",
            surface: "web-api",
            area: "auth",
            event: "extension_email_signup_otp.rejected",
            flowId,
            message: verifyResult.error.message ?? "Email sign-up verification rejected by auth server.",
            context: { authMethod: "email", intent },
          })
          return applyExtensionCorsHeaders(
            withRequestId(
              NextResponse.json(
                { error: verifyResult.error.message ?? "Verification failed." },
                { status: 401 }
              )
            ),
            request.headers.get("origin")
          )
        }

        authResult = await auth.signIn.email({
          email,
          password,
        })
      } else {
        authResult = await auth.signIn.email({
          email,
          password,
        })
      }

      if (authResult.error) {
        await logServerEvent({
          level: "warn",
          surface: "web-api",
          area: "auth",
          event: `extension_email_${intent}.rejected`,
          flowId,
          message: authResult.error.message ?? `Email ${intent} rejected by auth server.`,
          context: { authMethod: "email", intent },
        })
        return applyExtensionCorsHeaders(
          withRequestId(
            NextResponse.json(
              { error: authResult.error.message ?? `Email ${intent} failed.` },
              { status: 401 }
            )
          ),
          request.headers.get("origin")
        )
      }

      const authUser = extractAuthUser(
        (authResult.data as { user?: unknown } | null)?.user
      )

      if (!authUser) {
        throw new Error("Email auth did not return a valid user.")
      }

      await reconcileProfileForAuthUser(authUser)

      const isNewUser = intent === "sign-up"

      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "auth",
        event: "extension_auth_completed",
        flowId,
        message: `Completed extension email ${intent} for ${authUser.email}.`,
        userId: authUser.id,
        context: {
          authMethod: "email",
          intent,
          isNewUser,
          deviceName: body.deviceName ?? "Chrome Extension",
        },
      })

      if (isNewUser) {
        await logServerEvent({
          level: "info",
          surface: "web-api",
          area: "auth",
          event: "account_created",
          flowId,
          message: `Created a new email account for ${authUser.email}.`,
          userId: authUser.id,
          context: { authMethod: "email" },
        })
      }

      const tokenResult = await createExtensionTokenForUser(authUser.id, {
        deviceName: body.deviceName || "Chrome Extension",
      })

      const [projects, settings, onboarding] = await Promise.all([
        listProjectsForUser(authUser.id),
        getUserSettings(authUser.id),
        getResolvedOnboardingStateForUser(authUser.id),
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
        event: "extension_email_auth.succeeded",
        flowId,
        message: `Issued an extension session after email ${intent}.`,
        userId: authUser.id,
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
              userId: authUser.id,
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
        message: "Email sign-in for extension failed.",
        context: { authMethod: "email" },
        error,
      })

      return applyExtensionCorsHeaders(
        withRequestId(
          NextResponse.json(
            {
              error: error instanceof Error ? error.message : "Email sign-in for extension failed.",
            },
            { status: 500 }
          )
        ),
        request.headers.get("origin")
      )
    }
  })
}
