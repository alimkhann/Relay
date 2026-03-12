import { ExtensionConnectScreen } from "@/components/settings/extension-connect-screen"
import { AppShell } from "@/components/layout/app-shell"
import { requirePageViewer } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

export default async function ExtensionConnectPage({
  searchParams
}: {
  searchParams: Promise<{ extensionId?: string; deviceName?: string }>
}) {
  await requirePageViewer("/extension/connect")
  const params = await searchParams

  const extensionId = params.extensionId ?? ""
  const initialDeviceName = params.deviceName ?? "Relay in Chrome"
  const apiBase = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"

  return (
    <AppShell>
      <ExtensionConnectScreen apiBase={apiBase} extensionId={extensionId} initialDeviceName={initialDeviceName} />
    </AppShell>
  )
}
