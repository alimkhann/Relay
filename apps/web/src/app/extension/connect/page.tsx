import { redirect } from "next/navigation"

import { buildSignInHref, resolveAuthenticatedAppPath, resolveOptionalViewer } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

export default async function ExtensionConnectPage({
  searchParams: _searchParams
}: {
  searchParams: Promise<{ extensionId?: string; deviceName?: string }>
}) {
  const viewer = await resolveOptionalViewer()
  redirect(viewer ? resolveAuthenticatedAppPath("/dashboard") : buildSignInHref("/dashboard"))
}
