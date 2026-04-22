"use client";

import { useState, useEffect, useTransition } from "react";

import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client";
import { authClient } from "@/lib/auth/client";
import { withAuthCallbackParams } from "@/lib/auth/auth-callback";
import { Button } from "@/components/ui/button";
import type { WebAuthIntent } from "@/server/policies/viewer";
import {
  detectInAppBrowser,
  buildAndroidChromeIntent,
  type InAppBrowserPlatform,
} from "@/lib/utils/in-app-browser";

export function GoogleSignInButton({
  nextPath = "/dashboard",
  intent = "sign-in",
}: {
  nextPath?: string;
  intent?: WebAuthIntent;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inAppPlatform, setInAppPlatform] = useState<InAppBrowserPlatform>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const platform = detectInAppBrowser();
    if (!platform) return;
    setInAppPlatform(platform);
    logClientEvent({
      level: "info",
      surface: "web-auth",
      area: "auth",
      event: "in_app_browser.detected",
      message: "User is in an in-app browser where Google OAuth is blocked.",
      context: { platform },
    });
  }, []);

  return (
    <div className="space-y-3">
      <Button
        className="w-full rounded-[var(--relay-radius)] bg-[var(--relay-ink)] px-6 py-3 text-[var(--relay-bg)] shadow-sm hover:opacity-90 hover:shadow-md transition-all"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const flowId = createClientFlowId("auth");

            if (inAppPlatform === "android") {
              logClientEvent({
                level: "info",
                surface: "web-auth",
                area: "auth",
                event: "google_sign_in.in_app_redirect",
                flowId,
                message: "Redirecting Android in-app browser to Chrome.",
                context: { platform: "android" },
              });
              window.location.href = buildAndroidChromeIntent(window.location.href);
              return;
            }

            if (inAppPlatform === "ios") {
              logClientEvent({
                level: "info",
                surface: "web-auth",
                area: "auth",
                event: "google_sign_in.in_app_redirect",
                flowId,
                message: "Attempting iOS in-app browser escape.",
                context: { platform: "ios" },
              });
              try {
                await navigator.clipboard.writeText(window.location.href);
              } catch {
                // clipboard permission denied — user can still use "Copy link again"
              }
              window.open(window.location.href, "_blank");
              setIosHint(true);
              return;
            }

            logClientEvent({
              level: "info",
              surface: "web-auth",
              area: "auth",
              event: "google_sign_in.started",
              flowId,
              message: "User started Google sign-in from the web app.",
              context: {
                authMethod: "google",
                authIntent: intent,
              },
            });

            try {
              const callbackPath = withAuthCallbackParams(nextPath, {
                method: "google",
                intent,
              });

              const signInResult = await authClient.signIn.social({
                provider: "google",
                callbackURL: callbackPath,
                newUserCallbackURL: callbackPath,
                requestSignUp: intent === "sign-up",
                disableRedirect: intent === "sign-up",
              });

              if (intent === "sign-up") {
                const authUrl = (signInResult.data as { url?: string } | null)?.url;

                if (!authUrl) {
                  throw new Error("Google sign-in did not return an authorization URL.");
                }

                // Preserve auth_callback on the final redirect_uri if possible
                const url = new URL(authUrl);
                url.searchParams.set("prompt", "select_account");
                window.location.assign(url.toString());
              }
            } catch (cause) {
              logClientEvent({
                level: "error",
                surface: "web-auth",
                area: "auth",
                event: "google_sign_in.failed",
                flowId,
                message: "Google sign-in failed before redirect completed.",
                context: {
                  authMethod: "google",
                  authIntent: intent,
                },
                error: cause,
              });
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Google sign-in failed.",
              );
            }
          })
        }
      >
        {pending
          ? inAppPlatform
            ? "Opening browser…"
            : "Opening Google…"
          : "Continue with Google"}
      </Button>
      {iosHint ? (
        <p className="text-sm text-[var(--relay-muted)]">
          Link copied. Tap{" "}
          <strong className="text-[var(--relay-ink)]">···</strong> (top right) →{" "}
          <strong className="text-[var(--relay-ink)]">Open in Safari</strong>, then paste.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-[var(--relay-ink)] transition"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
              } catch {}
            }}
          >
            Copy link again
          </button>
        </p>
      ) : inAppPlatform ? (
        <p className="text-xs text-[var(--relay-faint)]">
          Best experience in Safari or Chrome.
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
