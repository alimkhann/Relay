import { redirect } from "next/navigation"

import { getAuthServer } from "@/lib/auth/server"
import { buildSignInHref } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

export default async function GetStartedPage() {
  const auth = getAuthServer()
  const { data } = auth ? await auth.getSession() : { data: null }

  if (data?.user) {
    redirect("/dashboard")
  }

  redirect(buildSignInHref("/dashboard", { intent: "sign-up" }))
}
