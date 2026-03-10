const storage = typeof chrome !== "undefined" ? chrome.storage.local : null

const keys = {
  apiBase: "relay.apiBase",
  token: "relay.authToken",
  projectId: "relay.projectId",
  targetProfileKey: "relay.targetProfileKey"
} as const

export async function getRelaySession() {
  if (!storage) {
    return {
      apiBase: process.env.PLASMO_PUBLIC_RELAY_API_BASE ?? "http://localhost:3000",
      token: "",
      projectId: "",
      targetProfileKey: "claude_code_build"
    }
  }

  const values = await storage.get(Object.values(keys))
  return {
    apiBase: (values[keys.apiBase] as string | undefined) ?? process.env.PLASMO_PUBLIC_RELAY_API_BASE ?? "http://localhost:3000",
    token: (values[keys.token] as string | undefined) ?? "",
    projectId: (values[keys.projectId] as string | undefined) ?? "",
    targetProfileKey: (values[keys.targetProfileKey] as string | undefined) ?? "claude_code_build"
  }
}

export async function setRelaySession(input: Partial<Awaited<ReturnType<typeof getRelaySession>>>) {
  if (!storage) return

  await storage.set({
    [keys.apiBase]: input.apiBase,
    [keys.token]: input.token,
    [keys.projectId]: input.projectId,
    [keys.targetProfileKey]: input.targetProfileKey
  })
}
