import Link from "next/link"
import { redirect } from "next/navigation"

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { AppShell } from "@/components/layout/app-shell"
import { getAuthServer } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const auth = getAuthServer()
  const { data } = auth ? await auth.getSession() : { data: null }

  if (data?.user) {
    redirect("/dashboard")
  }

  return (
    <AppShell>
      <section className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[32px] border border-[var(--relay-line)] bg-[#193021] p-8 text-white shadow-[var(--relay-shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/68">Sign in</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Use Relay with your real project history.</h1>
          <p className="mt-4 max-w-md text-base leading-8 text-white/82">
            Sign in once, pair the extension from Chrome, and Relay can keep project state moving between tools without token paste.
          </p>
          <div className="mt-8 space-y-3 text-sm text-white/78">
            <p>Google OAuth is the only login path in this pass.</p>
            <p>The extension still uses its own device token under the hood, but the normal setup flow now hides that from the user.</p>
          </div>
        </div>

        <div className="rounded-[32px] border border-[var(--relay-line)] bg-white/86 p-8 shadow-[var(--relay-shadow)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--relay-muted)]">Continue</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Start with Google</h2>
          <p className="mt-3 max-w-lg text-base leading-8 text-[var(--relay-muted)]">
            After you sign in, open the Relay sidepanel in Chrome and use the built-in connect flow to finish setup.
          </p>
          <div className="mt-8">
            {auth ? (
              <GoogleSignInButton />
            ) : (
              <p className="rounded-[20px] bg-[var(--relay-soft)] px-4 py-4 text-sm leading-7 text-[var(--relay-muted)]">
                Add `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` to enable sign-in in this environment.
              </p>
            )}
          </div>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-[var(--relay-muted)]">
            <Link className="rounded-full border border-[var(--relay-line)] px-4 py-2 transition hover:bg-[var(--relay-soft)]" href="/">
              Back to landing
            </Link>
            <Link className="rounded-full border border-[var(--relay-line)] px-4 py-2 transition hover:bg-[var(--relay-soft)]" href="/dashboard">
              Dashboard
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
