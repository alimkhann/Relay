import Link from "next/link"
import type { PropsWithChildren } from "react"

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[#f6f1e7] text-stone-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
        <header className="flex flex-col gap-4 rounded-[28px] border border-stone-900/10 bg-white/70 px-6 py-5 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="text-xl font-semibold tracking-tight">
              Relay
            </Link>
            <p className="text-sm text-stone-600">Browser-first memory sidecar for moving between AI tools.</p>
          </div>
          <nav className="flex flex-wrap gap-3 text-sm text-stone-700">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/settings">Settings</Link>
            <Link href="/sign-in">Sign in</Link>
          </nav>
        </header>
        {children}
      </div>
    </div>
  )
}
