import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { getAuthServer } from "@/lib/auth/server";
import {
  resolveSafeNextPath,
  resolveWebAuthIntent,
} from "@/server/policies/viewer";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; intent?: string }>;
}) {
  const auth = getAuthServer();
  const { data } = auth ? await auth.getSession() : { data: null };
  const params = await searchParams;
  const nextPath = resolveSafeNextPath(params.next, "/dashboard");
  const intent = resolveWebAuthIntent(params.intent);

  if (data?.user) {
    redirect(nextPath);
  }

  const authConfigured = Boolean(
    process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-6">
      <PageTelemetry
        surface="web-auth"
        area="page"
        event="auth_page.viewed"
        message="Rendered the sign-in page."
      />
      <div className="w-full max-w-sm text-center">
        <Image
          src="/images/relay_logo_white.png"
          alt="Relay"
          width={36}
          height={36}
          className="mx-auto brightness-0"
        />

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900">
          {intent === "sign-up" ? "Create your Relay account" : "Sign in to Relay"}
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          {intent === "sign-up"
            ? "Start with Google and land in your dashboard."
            : "Keep your project brief ready for every fresh AI chat."}
        </p>

        <div className="mt-8">
          {authConfigured ? (
            <GoogleSignInButton nextPath={nextPath} intent={intent} />
          ) : (
            <p className="rounded-2xl bg-gray-100 px-4 py-4 text-sm text-gray-400">
              Add auth environment variables to enable sign-in.
            </p>
          )}
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-[13px] text-gray-400">
          <Link href="/" className="transition hover:text-gray-600">
            Home
          </Link>
          <span className="text-gray-200">·</span>
          <Link href="/terms" className="transition hover:text-gray-600">
            Terms
          </Link>
          <span className="text-gray-200">·</span>
          <Link href="/privacy" className="transition hover:text-gray-600">
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}
