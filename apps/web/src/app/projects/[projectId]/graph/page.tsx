import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { requirePageViewer } from "@/server/policies/viewer"
import { GraphView } from "@/features/graph"

export const dynamic = "force-dynamic"

export default async function FullscreenGraphPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  await requirePageViewer(`/projects/${projectId}/graph`)

  return (
    <div className="relative h-screen w-screen bg-[var(--relay-bg)]">
      <GraphView projectId={projectId} fullscreen />

      {/* Floating back overlay */}
      <div className="fixed top-3 left-3 z-50">
        <Link
          href={`/dashboard?project=${projectId}`}
          className="inline-flex items-center gap-1.5 rounded-[var(--relay-radius-sm)] bg-[var(--relay-surface)]/90 backdrop-blur-sm border border-[var(--relay-line)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)] hover:bg-[var(--relay-surface)] transition shadow-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
      </div>
    </div>
  )
}
