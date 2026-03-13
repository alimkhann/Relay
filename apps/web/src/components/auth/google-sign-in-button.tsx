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
        className="w-full rounded-xl bg-[#111210] px-6 py-3 text-white shadow-sm hover:bg-[#2a2d2a] hover:shadow-md transition-all"
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
              await authClient.signIn.social({
                provider: "google",
                callbackURL: nextPath,
                newUserCallbackURL: nextPath,
                requestSignUp: intent === "sign-up",
              });
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
