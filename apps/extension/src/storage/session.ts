const storage = typeof chrome !== "undefined" ? chrome.storage.local : null

const keys = {
  apiBase: "relay.apiBase",
  token: "relay.authToken",
  projectId: "relay.projectId",
  targetProfileKey: "relay.targetProfileKey",
  connected: "relay.connected",
  autoCapture: "relay.autoCapture",
  limitedMode: "relay.limitedMode",
  lastStatus: "relay.lastStatus"
} as const

export async function getRelaySession() {
  if (!storage) {
    return {
      apiBase: process.env.PLASMO_PUBLIC_RELAY_API_BASE ?? "http://localhost:3000",
      token: "",
      projectId: "",
      targetProfileKey: "claude_code_build",
      connected: false,
      autoCapture: true,
      limitedMode: false,
      lastStatus: ""
    }
  }

  const values = await storage.get(Object.values(keys))
  return {
    apiBase: (values[keys.apiBase] as string | undefined) ?? process.env.PLASMO_PUBLIC_RELAY_API_BASE ?? "http://localhost:3000",
    token: (values[keys.token] as string | undefined) ?? "",
    projectId: (values[keys.projectId] as string | undefined) ?? "",
    targetProfileKey: (values[keys.targetProfileKey] as string | undefined) ?? "claude_code_build",
    connected: Boolean(values[keys.connected]),
    autoCapture: (values[keys.autoCapture] as boolean | undefined) ?? true,
    limitedMode: Boolean(values[keys.limitedMode]),
    lastStatus: (values[keys.lastStatus] as string | undefined) ?? ""
  }
}

export async function setRelaySession(input: Partial<Awaited<ReturnType<typeof getRelaySession>>>) {
  if (!storage) return

  const payload: Record<string, unknown> = {}

  if (input.apiBase !== undefined) payload[keys.apiBase] = input.apiBase
  if (input.token !== undefined) payload[keys.token] = input.token
  if (input.projectId !== undefined) payload[keys.projectId] = input.projectId
  if (input.targetProfileKey !== undefined) payload[keys.targetProfileKey] = input.targetProfileKey
  if (input.connected !== undefined) payload[keys.connected] = input.connected
  if (input.autoCapture !== undefined) payload[keys.autoCapture] = input.autoCapture
  if (input.limitedMode !== undefined) payload[keys.limitedMode] = input.limitedMode
  if (input.lastStatus !== undefined) payload[keys.lastStatus] = input.lastStatus

  if (Object.keys(payload).length > 0) {
    await storage.set(payload)
  }
}

export async function clearRelaySession() {
  if (!storage) return
  await storage.remove(Object.values(keys))
}
