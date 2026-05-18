import type { Metadata } from "next"
import { Suspense } from "react"

import { AskRelayLauncher } from "@/components/assistant/ask-relay-launcher"
import { DocsSidebar } from "@/components/docs/docs-sidebar"
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav"
import { WebMcpBootstrap } from "@/components/webmcp/webmcp-bootstrap"
import { resolveOptionalViewer } from "@/server/policies/viewer"
import { resolveViewerEntitlements } from "@/server/services/entitlement-service"

export const metadata: Metadata = {
  title: "Docs — Relay",
  description: "Learn how to set up and use Relay to keep project context synced across all your AI tools.",
  openGraph: {
    title: "Docs — Relay",
    description: "Learn how to set up and use Relay to keep project context synced across all your AI tools.",
  },
}

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await resolveOptionalViewer()
  const entitlements = viewer ? await resolveViewerEntitlements(viewer.userId) : null

  return (
    <div className="min-h-screen bg-[var(--relay-bg)]">
      <WebMcpBootstrap />
      {entitlements ? <AskRelayLauncher plan={entitlements.plan} surface="docs" /> : null}
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
