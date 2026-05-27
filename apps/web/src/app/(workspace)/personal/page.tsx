import { createRepositoryBundle } from "@relay/db"
import { computeDecayScore } from "@relay/shared"
import type { MemoryItemDto } from "@relay/shared"

import { MemoryItemListClient } from "@/components/memory/memory-item-list-client"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { requirePageViewer } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

export default async function PersonalSpacePage() {
  const viewer = await requirePageViewer("/personal")
  const repositories = createRepositoryBundle(viewer.userId)

  // Resolve or auto-create the personal space for this user.
  const space = await repositories.spaces.ensurePersonalSpaceForUser(viewer.userId)

  // Fetch via the typed repo so personal-space items get the same metadata
  // shape (source surface, captured/updated timestamps, decay) that the
  // project memory views render.
  const rows = await repositories.memory.listBySpace(space.id, {
    lifecycleStates: ["active", "cooling"],
    limit: 200,
  })

  const items: MemoryItemDto[] = rows.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    pinned: item.pinned,
    updatedAt: item.updatedAt,
    sourceSurface: item.sourceSurface,
    sourceUrl: item.sourceUrl,
    capturedAt: item.capturedAt,
    decayScore: computeDecayScore(item.type, item.updatedAt, item.lastReaffirmedAt, item.pinned),
    lastReaffirmedAt: item.lastReaffirmedAt,
  }))

  const lifecycleByItemId: Record<
    string,
    "active" | "cooling" | "archived" | "forgotten"
  > = Object.fromEntries(rows.map((row) => [row.id, row.lifecycleState ?? "active"]))

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="personal"
        pageGroup="workspace"
        message="Rendered the personal space page."
        context={{ spaceId: space.id }}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Personal space</p>
          <h1 className="text-3xl font-semibold">{space.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            General memory about you that lives outside any project. Integrations,
            personal preferences, contacts, routines all land here. Capture from
            the extension by switching the target to <strong>Personal</strong>{" "}
            before saving. Items in this space stay private to you and never
            count against your project quota.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <MemoryItemListClient
            items={items}
            emptyLabel="personal memory items"
            showTypeLabel
            lifecycleByItemId={lifecycleByItemId}
          />
        </section>
      </div>
    </>
  )
}
