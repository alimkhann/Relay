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

  useEffect(() => {
    setInAppPlatform(detectInAppBrowser());
  }, []);

  return (
    <div className="space-y-3">
      <Button
        className="h-14 w-full rounded-[var(--relay-radius)] border border-[var(--relay-line-strong)] bg-transparent px-6 text-[15px] font-semibold text-[var(--relay-ink)] shadow-none transition-all hover:border-[var(--relay-muted)] hover:bg-[var(--relay-soft)] disabled:opacity-45"
        disabled={pending || !!inAppPlatform}
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
        <span aria-hidden="true" className="mr-3 text-[22px] leading-none">G</span>
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
