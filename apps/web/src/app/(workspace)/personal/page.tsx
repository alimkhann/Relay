import { redirect } from "next/navigation"

import { createRepositoryBundle } from "@relay/db"

import { requirePageViewer } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

/**
 * Personal memory is a kind='personal' project, so it renders through the
 * exact same dashboard as any project. Resolve (or lazily create) the user's
 * personal project and redirect to the shared dashboard route.
 */
export default async function PersonalSpacePage() {
  const viewer = await requirePageViewer("/personal")
  const repositories = createRepositoryBundle(viewer.userId)
  const personal = await repositories.projects.ensurePersonalProject(viewer.userId)
  redirect(`/dashboard?project=${personal.id}`)
}
