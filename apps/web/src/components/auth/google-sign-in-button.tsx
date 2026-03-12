"use client";

import { useState, useTransition } from "react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function GoogleSignInButton() {
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

            try {
              await authClient.signIn.social({
                provider: "google",
                callbackURL: "/dashboard",
              });
            } catch (cause) {
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
