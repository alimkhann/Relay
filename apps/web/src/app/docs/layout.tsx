import type { Metadata } from "next"
import { Suspense } from "react"

import { DocsSidebar } from "@/components/docs/docs-sidebar"
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav"

export const metadata: Metadata = {
  title: "Docs — Relay",
  description: "Learn how to set up and use Relay to keep project context synced across all your AI tools.",
  openGraph: {
    title: "Docs — Relay",
    description: "Learn how to set up and use Relay to keep project context synced across all your AI tools.",
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--relay-bg)]">
      <Suspense fallback={null}>
        <DocsMobileNav />
      </Suspense>

      <div className="mx-auto flex max-w-5xl">
        <Suspense fallback={null}>
          <DocsSidebar />
        </Suspense>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-10 md:px-12">
          <div className="max-w-2xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
