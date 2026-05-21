import { createRepositoryBundle } from "@relay/db"

import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { requirePageViewer } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

interface PersonalMemoryItem {
  id: string
  type: string
  title: string | null
  content: string
  tags: string[]
  pinned: boolean
  lifecycleState: string
  createdAt: string
}

export default async function PersonalSpacePage() {
  const viewer = await requirePageViewer("/personal")
  const repositories = createRepositoryBundle(viewer.userId)

  // Resolve or auto-create the personal space for this user.
  const space = await repositories.spaces.ensurePersonalSpaceForUser(viewer.userId)

  const rows = await repositories.provider.query(
    `SELECT id, type, title, content, tags, pinned, lifecycle_state, created_at
     FROM memory_items
     WHERE space_id = $1
       AND lifecycle_state IN ('active','cooling')
     ORDER BY pinned DESC, created_at DESC
     LIMIT 200`,
    [space.id],
  )

  const items: PersonalMemoryItem[] = rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      type: String(r.type),
      title: r.title ? String(r.title) : null,
      content: String(r.content),
      tags: (r.tags as string[]) ?? [],
      pinned: Boolean(r.pinned),
      lifecycleState: String(r.lifecycle_state),
      createdAt: String(r.created_at),
    }
  })

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
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card/40 p-6 text-sm text-muted-foreground">
              No personal memory yet. Open the extension, switch to{" "}
              <strong>Personal</strong>, and capture something from a conversation —
              it will appear here.
            </div>
          ) : (
            items.map((item) => (
              <article
                key={item.id}
                className="rounded-lg border bg-card p-4 shadow-sm transition hover:shadow-md"
              >
                <header className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs uppercase tracking-wider text-primary">
                    {item.type}
                  </span>
                  {item.lifecycleState === "cooling" && (
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
                      cooling
                    </span>
                  )}
                  {item.pinned && <span className="text-xs">📌</span>}
                  {item.title && <span className="text-sm font-medium">{item.title}</span>}
                </header>
                <p className="whitespace-pre-wrap text-sm">{item.content}</p>
                {item.tags.length > 0 && (
                  <footer className="mt-3 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </footer>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </>
  )
}
