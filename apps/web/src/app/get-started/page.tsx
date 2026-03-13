import { redirect } from "next/navigation"

import { buildSignInHref } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

export default async function GetStartedPage() {
  redirect(buildSignInHref("/dashboard", { intent: "sign-up" }))
}
