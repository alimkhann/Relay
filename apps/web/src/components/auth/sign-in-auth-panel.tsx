"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"

import { EmailSignInForm } from "@/components/auth/email-sign-in-form"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { LocalSignInForm } from "@/components/auth/local-sign-in-form"
import { SignInAnimatedItem } from "@/components/auth/sign-in-animated"
import type { AuthProvider } from "@/lib/auth/provider"
import type { WebAuthIntent } from "@/server/policies/viewer"

export function SignInAuthPanel({
  authConfigured,
  authProvider,
  intent,
  nextPath,
}: {
  authConfigured: boolean
  authProvider: AuthProvider
  intent: WebAuthIntent
  nextPath: string
}) {
  const [emailOtpActive, setEmailOtpActive] = useState(false)

  return (
    <div className="w-full max-w-[430px]">
      {emailOtpActive ? null : (
        <>
          <SignInAnimatedItem delay={0}>
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-2 text-[15px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>
          </SignInAnimatedItem>

          <SignInAnimatedItem delay={0.05} className="lg:hidden flex justify-center mb-8">
            <Image
              src="/images/relay_logo_white.png"
              alt="Relay"
              width={36}
              height={36}
              className="brightness-0 dark:brightness-100"
            />
          </SignInAnimatedItem>

          <SignInAnimatedItem delay={0.1}>
            <h1 className="text-[32px] font-semibold tracking-tight text-[var(--relay-ink)] text-center lg:text-left">
              {intent === "sign-up"
                ? "Create your Relay account"
                : "Sign in to Relay"}
            </h1>
          </SignInAnimatedItem>

          <SignInAnimatedItem delay={0.15}>
            <p className="mt-3 text-[17px] leading-relaxed text-[var(--relay-muted)] text-center lg:text-left">
              {intent === "sign-up"
                ? authProvider === "local"
                  ? "Use local dev auth and land in your dashboard."
                  : "Start with Google and land in your dashboard."
                : authProvider === "local"
                  ? "Use local dev auth to keep your project brief ready."
                  : "Keep your project brief ready for every fresh AI chat."}
            </p>
          </SignInAnimatedItem>
        </>
      )}

      <SignInAnimatedItem delay={emailOtpActive ? 0 : 0.25} className={emailOtpActive ? "" : "mt-8"}>
        {authConfigured ? (
          authProvider === "local" ? (
            <LocalSignInForm nextPath={nextPath} intent={intent} />
          ) : (
            <div className="space-y-4">
              {emailOtpActive ? null : (
                <>
                  <GoogleSignInButton nextPath={nextPath} intent={intent} />
                  <div className="flex items-center gap-4 py-1">
                    <div className="h-px flex-1 bg-[var(--relay-line)]" />
                    <span className="text-sm text-[var(--relay-muted)]">Or continue with email</span>
                    <div className="h-px flex-1 bg-[var(--relay-line)]" />
                  </div>
                </>
              )}
              <EmailSignInForm
                nextPath={nextPath}
                intent={intent}
                onPendingVerificationChange={setEmailOtpActive}
              />
            </div>
          )
        ) : (
          <p className="rounded-[var(--relay-radius)] bg-[var(--relay-soft)] px-4 py-4 text-sm text-[var(--relay-muted)]">
            Add auth environment variables to enable sign-in.
          </p>
        )}
      </SignInAnimatedItem>

      {emailOtpActive ? null : (
        <SignInAnimatedItem delay={0.35}>
          <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--relay-faint)]">
            By continuing, you agree to our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2 transition hover:text-[var(--relay-muted)]"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 transition hover:text-[var(--relay-muted)]"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </SignInAnimatedItem>
      )}
    </div>
  )
}
