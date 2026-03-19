import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { LocalSignInForm } from "@/components/auth/local-sign-in-form";
import { getAuthProvider } from "@/lib/auth/provider";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { pickRandomLandingBackground } from "@/app/(marketing)/background-images";
import {
  resolveAuthenticatedAppPath,
  resolveOptionalViewer,
  resolveSafeNextPath,
  resolveWebAuthIntent,
} from "@/server/policies/viewer";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; intent?: string }>;
}) {
  const params = await searchParams;
  const nextPath = resolveSafeNextPath(params.next, "/dashboard");
  const intent = resolveWebAuthIntent(params.intent);
  const viewer = await resolveOptionalViewer();

  if (viewer) {
    redirect(resolveAuthenticatedAppPath(nextPath));
  }

  const authProvider = getAuthProvider();
  const authConfigured = Boolean(
    authProvider === "local" ||
      (process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET),
  );
  const authBackgroundSrc = pickRandomLandingBackground();

  return (
    <main className="flex min-h-screen bg-[var(--relay-bg)]">
      <PageTelemetry
        surface="web-auth"
        area="page"
        event="auth_page.viewed"
        message="Rendered the sign-in page."
      />

      {/* Left column — hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <Image
          src={authBackgroundSrc}
          alt=""
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/46" />
        <div className="relative z-10 flex h-full w-full flex-col p-12">
          <Link href="/" className="self-start">
            <Image
              src="/images/relay_logo_white.png"
              alt="Relay"
              width={28}
              height={28}
            />
          </Link>

          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-lg text-center">
              <h2 className="text-[30px] font-semibold tracking-tight leading-[1.08] text-white">
                Keep project context alive
                <br />
                across every AI tool.
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-white/72">
                Relay carries decisions, tasks, and constraints between chats,
                your IDE, and fresh sessions — so you do not restart context
                every time you switch tools.
              </p>
            </div>
          </div>

          <p className="self-end text-right text-[12px] text-white/55">
            Built for engineers who work across AI tools.
          </p>
        </div>
      </div>

      {/* Right column — auth */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Back button */}
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>

          {/* Mobile-only logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Image
              src="/images/relay_logo_white.png"
              alt="Relay"
              width={36}
              height={36}
              className="brightness-0 dark:brightness-100"
            />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-[var(--relay-ink)] text-center lg:text-left">
            {intent === "sign-up"
              ? "Create your Relay account"
              : "Sign in to Relay"}
          </h1>
          <p className="mt-2 text-sm text-[var(--relay-muted)] text-center lg:text-left">
            {intent === "sign-up"
              ? authProvider === "local"
                ? "Use local dev auth and land in your dashboard."
                : "Start with Google and land in your dashboard."
              : authProvider === "local"
                ? "Use local dev auth to keep your project brief ready."
                : "Keep your project brief ready for every fresh AI chat."}
          </p>

          <div className="mt-8">
            {authConfigured ? (
              authProvider === "local" ? (
                <LocalSignInForm nextPath={nextPath} />
              ) : (
                <GoogleSignInButton nextPath={nextPath} intent={intent} />
              )
            ) : (
              <p className="rounded-[var(--relay-radius)] bg-[var(--relay-soft)] px-4 py-4 text-sm text-[var(--relay-muted)]">
                Add auth environment variables to enable sign-in.
              </p>
            )}
          </div>

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

        </div>
      </div>
    </main>
  );
}
