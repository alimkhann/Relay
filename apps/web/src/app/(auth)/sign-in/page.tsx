import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InAppBrowserBanner } from "@/components/auth/in-app-browser-banner";
import { SignInAuthPanel } from "@/components/auth/sign-in-auth-panel";
import { PostHogIdentity } from "@/components/telemetry/posthog-identity";
import { SignInAnimatedItem } from "@/components/auth/sign-in-animated";
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
      <InAppBrowserBanner />
      <PostHogIdentity userId={null} />
      <PageTelemetry
        surface="web-auth"
        area="page"
        pageName="sign_in"
        pageGroup="auth"
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
          <SignInAnimatedItem delay={0} className="self-start">
            <Link href="/">
              <Image
                src="/images/relay_logo_white.png"
                alt="Relay"
                width={28}
                height={28}
              />
            </Link>
          </SignInAnimatedItem>

          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-lg text-center">
              <SignInAnimatedItem delay={0.1}>
                <h2 className="text-[30px] font-semibold tracking-tight leading-[1.08] text-white">
                  Keep project context alive
                  <br />
                  across every AI tool.
                </h2>
              </SignInAnimatedItem>
              <SignInAnimatedItem delay={0.2}>
                <p className="mt-5 text-[15px] leading-relaxed text-white/72">
                  Relay carries decisions, tasks, and constraints between chats,
                  your IDE, and fresh sessions — so you do not restart context
                  every time you switch tools.
                </p>
              </SignInAnimatedItem>
            </div>
          </div>

          <SignInAnimatedItem delay={0.3} className="self-end">
            <p className="text-right text-[12px] text-white/55">
              Built for engineers who work across AI tools.
            </p>
          </SignInAnimatedItem>
        </div>
      </div>

      {/* Right column — auth */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <SignInAuthPanel
          authConfigured={authConfigured}
          authProvider={authProvider}
          intent={intent}
          nextPath={nextPath}
        />
      </div>
    </main>
  );
}
