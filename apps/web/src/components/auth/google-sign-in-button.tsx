"use client";

import { useState, useTransition } from "react";

import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import type { WebAuthIntent } from "@/server/policies/viewer";

export function GoogleSignInButton({
  nextPath = "/dashboard",
  intent = "sign-in",
}: {
  nextPath?: string;
  intent?: WebAuthIntent;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Button
        className="w-full rounded-[var(--relay-radius)] bg-[var(--relay-ink)] px-6 py-3 text-[var(--relay-bg)] shadow-sm hover:opacity-90 hover:shadow-md transition-all"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const flowId = createClientFlowId("auth");

            logClientEvent({
              level: "info",
              surface: "web-auth",
              area: "auth",
              event: "google_sign_in.started",
              flowId,
              message: "User started Google sign-in from the web app.",
            });

            try {
              // Append auth_callback=1 so the LogoPreloader fires after OAuth return
              function withAuthCallback(path: string) {
                try {
                  const base = window.location.origin;
                  const url = new URL(path.startsWith("/") ? `${base}${path}` : path);
                  url.searchParams.set("auth_callback", "1");
                  return url.pathname + url.search;
                } catch {
                  return path;
                }
              }

              const callbackPath = withAuthCallback(nextPath);

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
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
