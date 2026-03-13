import { NextResponse } from "next/server";

import { createRepositoryBundle } from "@relay/db";
import { createFlowId } from "@relay/shared";

import { requireAuthServer } from "@/lib/auth/server";
import { logServerEvent } from "@/server/logging/logger";
import {
  getRequestContext,
  withRequestContext,
} from "@/server/logging/request-context";
import { createExtensionTokenForUser } from "@/server/services/extension-token-service";
import { getUserSettings } from "@/server/services/settings-service";
import { listProjectsForUser } from "@/server/services/project-service";

import { reconcileProfileForAuthUser } from "@/server/services/auth-sync-service";

interface NeonAuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

function extractAuthUser(value: unknown): NeonAuthUser | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    email?: unknown;
    name?: unknown;
    image?: unknown;
  };

  if (typeof candidate.id !== "string" || typeof candidate.email !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    email: candidate.email,
    name: typeof candidate.name === "string" ? candidate.name : null,
    image: typeof candidate.image === "string" ? candidate.image : null,
  };
}

async function verifyGoogleIdentity(googleAccessToken: string) {
  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { authorization: `Bearer ${googleAccessToken}` },
    },
  );

  if (!userInfoResponse.ok) {
    throw new Error("Invalid Google access token.");
  }

  const googleUser = (await userInfoResponse.json()) as GoogleUserInfo;
  if (!googleUser.email || !googleUser.sub) {
    throw new Error("Google account is missing required identity fields.");
  }

  return googleUser;
}

async function ensureGoogleAccountLink(input: {
  userId: string;
  googleAccountId: string;
  googleAccessToken: string;
  googleIdToken: string;
}) {
  const repositories = createRepositoryBundle();
  const existingAccountRows = await repositories.provider.query<{ id: string }>(
    `select id
     from neon_auth.account
     where "providerId" = 'google'
       and "accountId" = $1
     limit 1`,
    [input.googleAccountId],
  );

  const existingAccountId = existingAccountRows[0]?.id;

  if (existingAccountId) {
    await repositories.provider.query(
      `update neon_auth.account
       set "userId" = $2::uuid,
           "accessToken" = $3,
           "idToken" = $4,
           "updatedAt" = now()
       where id = $1::uuid`,
      [
        existingAccountId,
        input.userId,
        input.googleAccessToken,
        input.googleIdToken,
      ],
    );
    return;
  }

  await repositories.provider.query(
    `insert into neon_auth.account (
       "accountId",
       "providerId",
       "userId",
       "accessToken",
       "idToken",
       "createdAt",
       "updatedAt"
     )
     values ($1, 'google', $2::uuid, $3, $4, now(), now())`,
    [
      input.googleAccountId,
      input.userId,
      input.googleAccessToken,
      input.googleIdToken,
    ],
  );
}

async function resolveOrProvisionAuthUser(input: {
  googleUser: GoogleUserInfo;
  googleAccessToken: string;
  googleIdToken: string;
}) {
  const repositories = createRepositoryBundle();

  const linkedAccountRows = await repositories.provider.query<{
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  }>(
    `select u.id, u.email, u.name, u.image
     from neon_auth.account a
     join neon_auth."user" u on u.id = a."userId"
     where a."providerId" = 'google'
       and a."accountId" = $1
     limit 1`,
    [input.googleUser.sub],
  );

  let userId = linkedAccountRows[0]?.id ?? null;

  if (!userId) {
    const emailRows = await repositories.provider.query<{
      id: string;
      email: string;
      name: string | null;
      image: string | null;
    }>(
      `select id, email, name, image
       from neon_auth."user"
       where email = $1
       limit 1`,
      [input.googleUser.email],
    );
    userId = emailRows[0]?.id ?? null;
  }

  if (!userId) {
    const insertedRows = await repositories.provider.query<{
      id: string;
      email: string;
      name: string | null;
      image: string | null;
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
        input.googleUser.picture ?? null,
      ],
    );
    userId = insertedRows[0]?.id ?? null;
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
        input.googleUser.picture ?? null,
      ],
    );
  }

  if (!userId) {
    throw new Error("Failed to provision a Neon Auth user for Google sign-in.");
  }

  await ensureGoogleAccountLink({
    userId,
    googleAccountId: input.googleUser.sub,
    googleAccessToken: input.googleAccessToken,
    googleIdToken: input.googleIdToken,
  });

  return {
    id: userId,
    email: input.googleUser.email,
    name: input.googleUser.name ?? null,
    image: input.googleUser.picture ?? null,
  } satisfies NeonAuthUser;
}

function withRequestId(response: NextResponse) {
  const requestId = getRequestContext()?.requestId ?? createFlowId("req");
  response.headers.set("x-relay-request-id", requestId);
  return response;
}

export async function POST(request: Request) {
  return withRequestContext(request, async () => {
    const flowId =
      request.headers.get("x-relay-flow-id") ??
      getRequestContext()?.flowId ??
      createFlowId("ext-auth");

    try {
      const body = (await request.json()) as {
        googleAccessToken?: string;
        googleIdToken?: string;
        deviceName?: string;
      };

    if (!body.googleAccessToken || !body.googleIdToken) {
      await logServerEvent({
        level: "warn",
        surface: "web-api",
        area: "auth",
        event: "extension_google_auth.tokens_missing",
        flowId,
        message: "Extension Google auth request was missing Google OAuth tokens.",
      });
      return withRequestId(NextResponse.json(
        { error: "googleAccessToken and googleIdToken are required." },
        { status: 400 },
      ));
    }

    const googleUser = await verifyGoogleIdentity(body.googleAccessToken);
    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "auth",
      event: "extension_google_auth.identity_verified",
      flowId,
      message: `Verified Google identity for ${googleUser.email}.`,
      context: {
        deviceName: body.deviceName ?? "Chrome Extension",
      },
    });

    let authUser: NeonAuthUser | null = null;
    try {
      const auth = requireAuthServer();
      const signInResult = await auth.signIn.social({
        provider: "google",
        disableRedirect: true,
        requestSignUp: true,
        idToken: {
          token: body.googleIdToken,
          accessToken: body.googleAccessToken,
        },
      });

      if (signInResult.error) {
        const signInErrorMessage =
          signInResult.error.message ?? "Neon Auth social sign-in failed.";
        console.error("[Relay API] Neon Auth social sign-in failed:", {
          message: signInErrorMessage,
          googleEmail: googleUser.email,
        });
        await logServerEvent({
          level: "warn",
          surface: "web-api",
          area: "auth",
          event: "extension_google_auth.neon_social_failed",
          flowId,
          message: signInErrorMessage,
          context: {
            googleEmail: googleUser.email,
          },
        });
      } else {
        authUser = extractAuthUser(
          (signInResult.data as { user?: unknown } | null)?.user,
        );
        console.log("[Relay API] Neon Auth social sign-in result:", {
          googleEmail: googleUser.email,
          hasUser: Boolean(authUser),
          dataKeys:
            signInResult.data &&
            typeof signInResult.data === "object"
              ? Object.keys(signInResult.data)
              : [],
        });
        await logServerEvent({
          level: "info",
          surface: "web-api",
          area: "auth",
          event: "extension_google_auth.neon_social_completed",
          flowId,
          message: "Neon Auth social sign-in returned a response.",
          context: {
            googleEmail: googleUser.email,
            hasUser: Boolean(authUser),
          },
        });
      }
    } catch (error) {
      console.error("[Relay API] Neon Auth social sign-in exception:", error);
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "extension_google_auth.neon_social_exception",
        flowId,
        message: "Neon Auth social sign-in threw an exception.",
        context: {
          googleEmail: googleUser.email,
        },
        error,
      });
    }

    if (!authUser) {
      authUser = await resolveOrProvisionAuthUser({
        googleUser,
        googleAccessToken: body.googleAccessToken,
        googleIdToken: body.googleIdToken,
      });
      console.log("[Relay API] Provisioned Neon Auth user for extension-first Google auth:", {
        userId: authUser.id,
        email: authUser.email,
      });
      await logServerEvent({
        level: "info",
        surface: "web-api",
        area: "auth",
        event: "extension_google_auth.provisioned_user",
        flowId,
        message: `Provisioned Neon Auth user ${authUser.id} for extension-first Google auth.`,
        userId: authUser.id,
        context: {
          email: authUser.email,
        },
      });
    }

    await reconcileProfileForAuthUser(authUser);

    // Create a device token for the extension
    const tokenResult = await createExtensionTokenForUser(authUser.id, {
      deviceName: body.deviceName || "Chrome Extension",
    });

    const [projects, settings] = await Promise.all([
      listProjectsForUser(authUser.id),
      getUserSettings(authUser.id),
    ]);

    const appUrl =
      process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000";

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "auth",
      event: "extension_google_auth.succeeded",
      flowId,
      message: "Issued an extension session after Google auth.",
      userId: authUser.id,
      projectId: projects[0]?.id ?? null,
      context: {
        projectCount: projects.length,
        hasDefaultProject: Boolean(projects[0]?.id),
      },
    });

    return withRequestId(NextResponse.json(
      {
        token: tokenResult.token,
        apiBase: appUrl,
        projects,
        settings,
        projectId: projects[0]?.id ?? "",
        targetProfileKey: settings.settings.defaultTargetProfileKey,
      },
      { status: 201 },
    ));
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "auth",
      event: "extension_google_auth.failed",
      flowId,
      message: "Google sign-in for extension failed on the server.",
      error,
    });
    return withRequestId(NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google sign-in for extension failed.",
      },
      { status: 500 },
    ));
  }
  });
}
