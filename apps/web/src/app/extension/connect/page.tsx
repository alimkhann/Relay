import { redirect } from "next/navigation"

import { ExtensionConnectScreen } from "@/components/settings/extension-connect-screen"
import { AppShell } from "@/components/layout/app-shell"
import { getAuthServer } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function ExtensionConnectPage({
  searchParams
}: {
  searchParams: Promise<{ extensionId?: string; deviceName?: string }>
}) {
  const auth = getAuthServer()
  const { data } = auth ? await auth.getSession() : { data: null }
  const params = await searchParams

  if (!data?.user) {
    redirect("/sign-in")
  }

  const extensionId = params.extensionId ?? ""
  const initialDeviceName = params.deviceName ?? "Relay in Chrome"
  const apiBase = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"

  return (
    <AppShell>
      <ExtensionConnectScreen apiBase={apiBase} extensionId={extensionId} initialDeviceName={initialDeviceName} />
    </AppShell>
  )
}
