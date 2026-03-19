import type { Metadata } from "next"
import { Suspense } from "react"

import { DocsSidebar } from "@/components/docs/docs-sidebar"

export const metadata: Metadata = {
  title: "Docs — Relay",
  description: "Learn how to set up and use Relay to keep project context synced across all your AI tools.",
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--relay-bg)]">
      <div className="mx-auto flex max-w-5xl">
        <Suspense fallback={null}>
          <DocsSidebar />
        </Suspense>

        <main className="min-w-0 flex-1 px-6 py-16 md:px-12">
          {children}
        </main>
      </div>
    </div>
  )
}
