import { redirect } from "next/navigation"

import { buildSignInHref, resolveAuthenticatedAppPath, resolveOptionalViewer } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await resolveOptionalViewer()
  const params = await searchParams
  const upgrade = params.upgrade === "true"
  const destination = upgrade ? "/settings?section=billing" : "/dashboard"

  redirect(
    viewer
      ? resolveAuthenticatedAppPath(destination)
      : buildSignInHref(destination, { intent: "sign-up" }),
  )
}
