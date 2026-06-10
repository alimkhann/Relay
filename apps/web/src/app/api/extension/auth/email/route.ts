import { createHash, randomInt } from "node:crypto"

import { NextResponse } from "next/server"

import { createFlowId } from "@relay/shared"
import { createRepositoryProvider } from "@relay/db"

import { getAuthProvider } from "@/lib/auth/provider"
import { applyExtensionCorsHeaders, buildExtensionPreflightResponse } from "@/server/http/extension-cors"
import { logServerEvent } from "@/server/logging/logger"
import { getRequestContext, withRequestContext } from "@/server/logging/request-context"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { extractAuthUser } from "@/server/services/google-auth-service"
import { reconcileProfileForAuthUser } from "@/server/services/auth-sync-service"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { ensurePersonalProjectForUser, listProjectsForUser } from "@/server/services/project-service"
import { getUserSettings } from "@/server/services/settings-service"
import { createExtensionTokenForUser } from "@/server/services/extension-token-service"
import { resolveExtensionSelectedProjectId } from "@/server/services/extension-project-selection"
import { sendEmailVerificationOtp } from "@/server/services/email-service"

const EMAIL_OTP_TTL_SQL = "5 minutes"

// NeonAuth (BetterAuth) rejects chrome-extension:// origins. Make server-side calls with our app origin instead.
async function neonAuthRequest(
  baseUrl: string,
  appOrigin: string,
  path: string,
  body: Record<string, unknown>
): Promise<{ data: unknown; error: { message?: string } | null }> {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": appOrigin,
      "x-neon-auth-proxy": "next",
    },
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    return { data: null, error: { message: (json as { message?: string } | null)?.message ?? response.statusText } }
  }
  return { data: json, error: null }
}

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

      const intent = body.intent ?? "sign-in"
      const email = body.email!
      const password = body.password!
      const appUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"
      const neonAuthBase = process.env.NEON_AUTH_BASE_URL
      if (!neonAuthBase) throw new Error("NEON_AUTH_BASE_URL is not configured.")
      let authResult: { data: unknown; error: { message?: string } | null }

      if (intent === "sign-up") {
        if (!body.otp) {
          // Send OTP only — do NOT create account yet to prevent bypass via reload
          const otp = randomInt(0, 1_000_000).toString().padStart(6, "0")
          const otpHash = createHash("sha256").update(otp).digest("hex")
          const db = createRepositoryProvider()
          await db.query(
            `INSERT INTO email_otp_tokens (email, otp_hash, expires_at)
             VALUES ($1, $2, NOW() + $3::interval)
             ON CONFLICT (email) DO UPDATE
               SET otp_hash = $2,
                   expires_at = NOW() + $3::interval,
                   used_at = NULL`,
            [email, otpHash, EMAIL_OTP_TTL_SQL]
          )

          try {
            await sendEmailVerificationOtp(email, otp)
          } catch (cause) {
            await logServerEvent({
              level: "warn",
              surface: "web-api",
              area: "auth",
              event: "extension_email_signup_otp.rejected",
              flowId,
              message: cause instanceof Error ? cause.message : "Could not send extension signup OTP.",
              context: { authMethod: "email", intent },
            })
            return applyExtensionCorsHeaders(
              withRequestId(
                NextResponse.json(
                  { error: "Could not send verification code." },
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

        // Verify OTP against custom token table
        const otpHash = createHash("sha256").update(body.otp).digest("hex")
        const db = createRepositoryProvider()
        const rows = await db.query<{ email: string }>(
          `SELECT email FROM email_otp_tokens
           WHERE email = $1
             AND otp_hash = $2
             AND expires_at > NOW()
             AND used_at IS NULL`,
          [email, otpHash]
        )

        if (rows.length === 0) {
          await logServerEvent({
            level: "warn",
            surface: "web-api",
            area: "auth",
            event: "extension_email_signup_otp.rejected",
            flowId,
            message: "Invalid or expired extension sign-up OTP.",
            context: { authMethod: "email", intent },
          })
          return applyExtensionCorsHeaders(
            withRequestId(
              NextResponse.json(
                { error: "Invalid or expired code." },
                { status: 401 }
              )
            ),
            request.headers.get("origin")
          )
        }

        await db.query(
          `UPDATE email_otp_tokens SET used_at = NOW() WHERE email = $1`,
          [email]
        )

        // OTP verified — now create account using direct fetch to avoid forwarding chrome-extension origin
        authResult = await neonAuthRequest(neonAuthBase, appUrl, "sign-up/email", {
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
      } else {
        authResult = await neonAuthRequest(neonAuthBase, appUrl, "sign-in/email", { email, password })
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

      await ensurePersonalProjectForUser(authUser.id)
      const [projects, settings, onboarding] = await Promise.all([
        listProjectsForUser(authUser.id, { includePersonal: true }),
        getUserSettings(authUser.id),
        getResolvedOnboardingStateForUser(authUser.id),
      ])

      const selectedProjectId = resolveExtensionSelectedProjectId(projects, onboarding)

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
