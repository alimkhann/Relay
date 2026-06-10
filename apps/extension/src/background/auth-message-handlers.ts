import { createFlowId } from "@relay/shared/utils/telemetry";
import type { RelayOnboardingState } from "@relay/shared";
import type { RelayMessage, RelayProjectOption } from "../messaging/contracts";
import { getRelaySession, resolveRelayApiBase } from "../storage/session";
import { requestGoogleIdentityTokens } from "./oauth";
import { authGrace } from "./state";
import { loadSessionData, storeAuthenticatedExtensionSession } from "./session-cache";
import type { ExtensionAuthSessionPayload } from "./bg-types";
import { readErrorResponse } from "./bg-utils";
import { identifyExtensionUser, recordBackgroundTelemetry } from "./telemetry";

export async function handleAuthMessage(
  message: RelayMessage,
  sendResponse: (response?: unknown) => void,
) {
  if (message.type === "RELAY_GOOGLE_SIGN_IN") {
    console.log("[Relay BG] RELAY_GOOGLE_SIGN_IN received");
    try {
      const flowId = message.payload.flowId ?? createFlowId("ext-auth");
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "auth",
        event: "google_sign_in.started",
        flowId,
        message: "Received Google sign-in request from the extension UI.",
        context: {
          deviceName: message.payload.deviceName,
        },
      });
      const googleTokens = await requestGoogleIdentityTokens({
        interactive: true,
        prompt: "select_account",
      });

      const session = await getRelaySession();
      const apiBase = resolveRelayApiBase({
        storedApiBase: session.apiBase,
      });
      const response = await fetch(
        `${apiBase}/api/extension/auth/google`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-relay-flow-id": flowId,
          },
          body: JSON.stringify({
            googleAccessToken: googleTokens.accessToken,
            googleIdToken: googleTokens.idToken,
            deviceName: message.payload.deviceName,
          }),
        },
      );
      console.log("[Relay BG] extension auth response status:", response.status);
      recordBackgroundTelemetry({
        level: response.ok ? "info" : "warn",
        surface: "extension-background",
        area: "auth",
        event: "google_sign_in.api_response",
        flowId,
        message: `Extension Google auth returned ${response.status}.`,
        context: {
          status: response.status,
        },
      });

      if (!response.ok) {
        const reason = await readErrorResponse(
          response,
          "Google sign-in failed.",
        );
        console.log("[Relay BG] extension auth failed:", reason);
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "auth",
          event: "google_sign_in.failed",
          flowId,
          message: reason,
        });
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "auth",
          event: "extension_auth_failed",
          flowId,
          message: reason,
          context: {
            authMethod: "google",
          },
        });
        sendResponse({ ok: false, reason });
    return true;
      }

      const payload = (await response.json()) as {
        token: string;
        apiBase: string;
        userId?: string;
        projectId: string;
        projects?: RelayProjectOption[];
        onboarding?: RelayOnboardingState;
        settings?: { settings?: { autoCapture?: boolean } };
      };
      console.log("[Relay BG] extension auth payload:", {
        apiBase: payload.apiBase,
        hasToken: Boolean(payload.token),
        projectId: payload.projectId,
      });
      if (!payload.token || !payload.apiBase) {
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "auth",
          event: "google_sign_in.invalid_payload",
          flowId,
          message: "Extension auth completed but Relay returned an incomplete session payload.",
        });
        sendResponse({
          ok: false,
          reason: "Extension auth completed but Relay did not return a valid session.",
        });
    return true;
      }

      await storeAuthenticatedExtensionSession(
        payload,
        "Signed in with Google.",
      );
      authGrace.until = Date.now() + 5_000;
      await loadSessionData();
      const storedSession = await getRelaySession();
      await identifyExtensionUser(storedSession.userId);
      console.log("[Relay BG] stored session after Google auth:", {
        connected: storedSession.connected,
        apiBase: storedSession.apiBase,
        hasToken: Boolean(storedSession.token),
        projectId: storedSession.projectId,
      });
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "auth",
        event: "google_sign_in.succeeded",
        flowId,
        message: "Stored Relay session after Google sign-in.",
        context: {
          connected: storedSession.connected,
          projectId: storedSession.projectId,
          hasToken: Boolean(storedSession.token),
        },
      });
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "auth",
        event: "extension_auth_completed",
        flowId,
        message: "Extension Google sign-in completed.",
        userId: storedSession.userId || null,
        projectId: storedSession.projectId || null,
        context: {
          authMethod: "google",
          connected: storedSession.connected,
        },
      });

      sendResponse({ ok: true });
    } catch (cause) {
      console.error("[Relay BG] Google sign-in exception:", cause);
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "auth",
        event: "google_sign_in.exception",
        message: "Google sign-in threw an exception in the background worker.",
        error: cause,
      });
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "auth",
        event: "extension_auth_failed",
        message: "Extension Google sign-in failed.",
        context: {
          authMethod: "google",
        },
        error: cause,
      });
      sendResponse({
        ok: false,
        reason:
          cause instanceof Error
            ? cause.message
            : "Google sign-in failed.",
      });
    }
    return true;
  }

  if (message.type === "RELAY_LOCAL_SIGN_IN") {
    try {
      const flowId = message.payload.flowId ?? createFlowId("ext-local-auth");
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "auth",
        event: "local_sign_in.started",
        flowId,
        message: "Received local sign-in request from the extension UI.",
        context: {
          deviceName: message.payload.deviceName,
          email: message.payload.email,
        },
      });

      const session = await getRelaySession();
      const apiBase = resolveRelayApiBase({
        storedApiBase: session.apiBase,
      });
      const response = await fetch(
        `${apiBase}/api/extension/auth/local`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-relay-flow-id": flowId,
          },
          body: JSON.stringify({
            email: message.payload.email,
            name: message.payload.name ?? null,
            deviceName: message.payload.deviceName,
          }),
        },
      );

      recordBackgroundTelemetry({
        level: response.ok ? "info" : "warn",
        surface: "extension-background",
        area: "auth",
        event: "local_sign_in.api_response",
        flowId,
        message: `Extension local auth returned ${response.status}.`,
        context: {
          status: response.status,
          apiBase,
        },
      });
      console.warn("[Relay BG] local sign-in api response", {
        status: response.status,
        apiBase,
        flowId,
      });

      if (!response.ok) {
        const reason = await readErrorResponse(
          response,
          "Local sign-in failed.",
        );
        console.warn("[Relay BG] local sign-in failed", {
          status: response.status,
          apiBase,
          reason,
          flowId,
        });
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "auth",
          event: "local_sign_in.failed",
          flowId,
          message: reason,
          context: {
            apiBase,
            status: response.status,
          },
        });
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "auth",
          event: "extension_auth_failed",
          flowId,
          message: reason,
          context: {
            authMethod: "local",
          },
        });
        sendResponse({ ok: false, reason });
    return true;
      }

      const payload = (await response.json()) as ExtensionAuthSessionPayload;
      if (!payload.token || !payload.apiBase) {
        sendResponse({
          ok: false,
          reason: "Local sign-in completed but Relay did not return a valid session.",
        });
    return true;
      }

      await storeAuthenticatedExtensionSession(
        payload,
        "Signed in locally.",
      );
      authGrace.until = Date.now() + 5_000;
      await loadSessionData();
      const storedSession = await getRelaySession();
      await identifyExtensionUser(storedSession.userId);
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "auth",
        event: "extension_auth_completed",
        flowId,
        message: "Extension local sign-in completed.",
        userId: storedSession.userId || null,
        projectId: storedSession.projectId || null,
        context: {
          authMethod: "local",
          connected: storedSession.connected,
        },
      });
      sendResponse({ ok: true });
    } catch (cause) {
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "auth",
        event: "local_sign_in.exception",
        message: "Local sign-in threw an exception in the background worker.",
        error: cause,
      });
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "auth",
        event: "extension_auth_failed",
        message: "Extension local sign-in failed.",
        context: {
          authMethod: "local",
        },
        error: cause,
      });
      sendResponse({
        ok: false,
        reason:
          cause instanceof Error
            ? cause.message
            : "Local sign-in failed.",
      });
    }
    return true;
  }

  if (message.type === "RELAY_EMAIL_SIGN_IN") {
    try {
      const flowId = message.payload.flowId ?? createFlowId("ext-email-auth");
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "auth",
        event: "email_sign_in.started",
        flowId,
        message: "Received email sign-in request from the extension UI.",
        context: {
          deviceName: message.payload.deviceName,
          intent: message.payload.intent ?? "sign-in",
        },
      });

      const session = await getRelaySession();
      const apiBase = resolveRelayApiBase({
        storedApiBase: session.apiBase,
      });
      const response = await fetch(
        `${apiBase}/api/extension/auth/email`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-relay-flow-id": flowId,
          },
          body: JSON.stringify({
            email: message.payload.email,
            password: message.payload.password,
            name: message.payload.name ?? null,
            intent: message.payload.intent ?? "sign-in",
            otp: message.payload.otp ?? null,
            resendOnly: message.payload.resendOnly ?? false,
            deviceName: message.payload.deviceName,
          }),
        },
      );

      recordBackgroundTelemetry({
        level: response.ok ? "info" : "warn",
        surface: "extension-background",
        area: "auth",
        event: "email_sign_in.api_response",
        flowId,
        message: `Extension email auth returned ${response.status}.`,
        context: {
          status: response.status,
          apiBase,
        },
      });

      if (response.status === 202) {
        const payload = (await response.json().catch(() => ({}))) as {
          requiresOtp?: boolean;
          message?: string;
        };
        sendResponse({
          ok: true,
          requiresOtp: payload.requiresOtp ?? true,
          message: payload.message ?? "Enter the verification code sent to your email.",
        });
    return true;
      }

      if (!response.ok) {
        const reason = await readErrorResponse(
          response,
          "Email sign-in failed.",
        );
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "auth",
          event: "email_sign_in.failed",
          flowId,
          message: reason,
          context: {
            apiBase,
            status: response.status,
          },
        });
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "auth",
          event: "extension_auth_failed",
          flowId,
          message: reason,
          context: {
            authMethod: "email",
          },
        });
        sendResponse({ ok: false, reason });
    return true;
      }

      const payload = (await response.json()) as ExtensionAuthSessionPayload;
      if (!payload.token || !payload.apiBase) {
        sendResponse({
          ok: false,
          reason: "Email sign-in completed but Relay did not return a valid session.",
        });
    return true;
      }

      await storeAuthenticatedExtensionSession(
        payload,
        "Signed in with email.",
      );
      authGrace.until = Date.now() + 5_000;
      await loadSessionData();
      const storedSession = await getRelaySession();
      await identifyExtensionUser(storedSession.userId);
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "auth",
        event: "extension_auth_completed",
        flowId,
        message: "Extension email sign-in completed.",
        userId: storedSession.userId || null,
        projectId: storedSession.projectId || null,
        context: {
          authMethod: "email",
          connected: storedSession.connected,
        },
      });
      sendResponse({ ok: true });
    } catch (cause) {
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "auth",
        event: "email_sign_in.exception",
        message: "Email sign-in threw an exception in the background worker.",
        error: cause,
      });
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "auth",
        event: "extension_auth_failed",
        message: "Extension email sign-in failed.",
        context: {
          authMethod: "email",
        },
        error: cause,
      });
      sendResponse({
        ok: false,
        reason:
          cause instanceof Error
            ? cause.message
            : "Email sign-in failed.",
      });
    }
    return true;
  }


  return false;
}
