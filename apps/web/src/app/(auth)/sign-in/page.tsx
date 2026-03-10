import Link from "next/link"

import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function SignInPage() {
  return (
    <AppShell>
      <Card className="mx-auto max-w-2xl p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Authentication</p>
        <h1 className="mt-4 font-serif text-4xl tracking-tight">Supabase auth plugs in here.</h1>
        <p className="mt-4 text-base leading-7 text-stone-700">
          The MVP baseline resolves users from Supabase bearer tokens when env is present and falls back to demo mode when
          `RELAY_ALLOW_DEMO_MODE=true`. Wire your Google provider in Supabase, then point the extension and web app at the same project.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link href="/dashboard">Continue in demo mode</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/">Back to landing</Link>
          </Button>
        </div>
      </Card>
    </AppShell>
  )
}
