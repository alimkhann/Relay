import type { RelayMessage } from "../messaging/contracts"
import { getRelaySession, setRelaySession } from "../storage/session"
import { relayFetch } from "../utils/api"

async function readErrorResponse(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string }
    return payload.error ?? payload.message ?? fallback
  } catch {
    return fallback
  }
}

const lastAutoCapturedByTab = new Map<number, string>()

function inferTargetProfile(platform?: string) {
  switch (platform) {
    case "perplexity":
      return "perplexity_research"
    case "claude":
      return "claude_code_build"
    case "codex":
      return "codex_implementation"
    case "chatgpt":
    default:
      return "chatgpt_planning"
  }
}

async function loadSessionData() {
  const session = await getRelaySession()
  if (!session.token) {
    return {
      connected: false,
      projects: [],
      settings: null
    }
  }

  const [projectsResponse, settingsResponse] = await Promise.all([
    relayFetch("/api/projects"),
    relayFetch("/api/settings")
  ])

  if (!projectsResponse.ok) {
    throw new Error(await readErrorResponse(projectsResponse, "Failed to load projects."))
  }

  if (!settingsResponse.ok) {
    throw new Error(await readErrorResponse(settingsResponse, "Failed to load settings."))
  }

  const projectsPayload = (await projectsResponse.json()) as { projects: Array<{ id: string }> }
  const settingsPayload = (await settingsResponse.json()) as {
    settings: {
      settings: {
        autoCapture: boolean
        defaultTargetProfileKey: string
      }
    }
  }

  const nextProjectId =
    session.projectId && projectsPayload.projects.some((project) => project.id === session.projectId)
      ? session.projectId
      : projectsPayload.projects[0]?.id ?? ""

  await setRelaySession({
    connected: true,
    projectId: nextProjectId,
    autoCapture: settingsPayload.settings.settings.autoCapture,
    targetProfileKey: session.targetProfileKey || settingsPayload.settings.settings.defaultTargetProfileKey
  })

  return {
    connected: true,
    projects: projectsPayload.projects,
    settings: settingsPayload.settings
  }
}

async function captureTab(projectId: string, tabId: number) {
  const result = await chrome.tabs.sendMessage(tabId, {
    type: "RELAY_CAPTURE_VISIBLE",
    payload: { projectId, tabId }
  })

  if (!result?.ok || !result.capture) {
    return result ?? { ok: false, reason: "Capture failed." }
  }

  const response = await relayFetch("/api/captures", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      ...result.capture
    })
  })

  if (!response.ok) {
    return {
      ok: false,
      reason: await readErrorResponse(response, "Capture request failed.")
    }
  }

  const payload = await response.json()

  return {
    ok: true,
    turns: payload.turns?.length ?? result.capture.turns?.length ?? 0,
    digestQueued: Boolean(payload.digestQueued)
  }
}

async function maybeAutoCapture(tabId: number) {
  const session = await getRelaySession()
  if (!session.connected || !session.token || !session.projectId || !session.autoCapture) {
    return
  }

  try {
    const pageState = (await chrome.tabs.sendMessage(tabId, { type: "RELAY_PAGE_STATE" })) as {
      supported?: boolean
      captureSignature?: string
      isFreshChat?: boolean
    } | null

    if (!pageState?.supported || pageState.isFreshChat) {
      return
    }

    if (pageState.captureSignature && lastAutoCapturedByTab.get(tabId) === pageState.captureSignature) {
      return
    }

    const result = await captureTab(session.projectId, tabId)
    if (result?.ok && pageState.captureSignature) {
      lastAutoCapturedByTab.set(tabId, pageState.captureSignature)
    }
  } catch {
    return
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
})

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { status?: string }) => {
  if (changeInfo.status === "complete") {
    void maybeAutoCapture(tabId)
  }
})

chrome.tabs.onActivated.addListener((activeInfo: { tabId: number }) => {
  void maybeAutoCapture(activeInfo.tabId)
})

chrome.runtime.onMessage.addListener((message: RelayMessage, sender: any, sendResponse: (response?: unknown) => void) => {
  void (async () => {
    try {
      if (message.type === "RELAY_GENERATE_BOOTSTRAP") {
        const response = await relayFetch(`/api/projects/${message.payload.projectId}/bootstrap`, {
          method: "POST",
          body: JSON.stringify({
            targetProfileKey: message.payload.targetProfileKey,
            kind: message.payload.kind,
            deep: message.payload.deep
          })
        })

        if (!response.ok) {
          sendResponse({ error: await readErrorResponse(response, "Bootstrap generation failed.") })
          return
        }

        sendResponse(await response.json())
        return
      }

      if (message.type === "RELAY_OPEN_CONNECT") {
        const session = await getRelaySession()
        const url = `${session.apiBase}/extension/connect?extensionId=${chrome.runtime.id}&deviceName=${encodeURIComponent(message.payload.deviceName)}`
        await chrome.tabs.create({ url })
        sendResponse({ ok: true })
        return
      }

      if (message.type === "RELAY_REFRESH_SESSION") {
        const payload = await loadSessionData()
        sendResponse({ ok: true, ...payload })
        return
      }

      if (message.type === "RELAY_PIN_SELECTION") {
        const tabId = message.payload.tabId ?? sender.tab?.id

        if (!tabId) {
          sendResponse({ ok: false, reason: "No supported tab was provided for pinning." })
          return
        }

        const selection = await chrome.tabs.sendMessage(tabId, { type: "RELAY_GET_SELECTION" })

        if (!selection?.ok || !selection.text) {
          sendResponse(selection ?? { ok: false, reason: "Select text in the page first." })
          return
        }

        const response = await relayFetch(`/api/projects/${message.payload.projectId}/memory`, {
          method: "POST",
          body: JSON.stringify({
            type: "note",
            pinned: true,
            title: `Pinned from ${selection.platform ?? "AI tab"}`,
            content: selection.text,
            metadata: selection.metadata ?? {}
          })
        })

        if (!response.ok) {
          sendResponse({ ok: false, reason: await readErrorResponse(response, "Pin selection failed.") })
          return
        }

        sendResponse({ ok: true })
        return
      }

      if (message.type === "RELAY_CAPTURE_VISIBLE") {
        const tabId = message.payload.tabId ?? sender.tab?.id

        if (!tabId) {
          sendResponse({ ok: false, reason: "No supported tab was provided for capture." })
          return
        }

        sendResponse(await captureTab(message.payload.projectId, tabId))
        return
      }

      if (message.type === "RELAY_PAGE_STATE" && sender.tab?.id) {
        const response = await chrome.tabs.sendMessage(sender.tab.id, message)
        sendResponse(response)
        return
      }

      if (message.type === "RELAY_INSERT_CONTEXT" && sender.tab?.id) {
        const response = await chrome.tabs.sendMessage(sender.tab.id, message)
        sendResponse(response)
        return
      }

      const session = await getRelaySession()
      sendResponse(session)
    } catch (cause) {
      sendResponse({
        error: cause instanceof Error ? cause.message : "Relay request failed."
      })
    }
  })()

  return true
})

chrome.runtime.onMessageExternal.addListener((message: any, _sender: unknown, sendResponse: (response?: unknown) => void) => {
  void (async () => {
    try {
      if (message?.type !== "RELAY_CONNECT_GRANT") {
        sendResponse({ ok: false, reason: "Unsupported external message." })
        return
      }

      const response = await fetch(`${message.payload.apiBase}/api/extension/connect/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          grantToken: message.payload.grantToken
        })
      })

      if (!response.ok) {
        sendResponse({ ok: false, reason: await readErrorResponse(response, "Extension pairing failed.") })
        return
      }

      const payload = (await response.json()) as {
        token: string
        apiBase: string
        projectId: string
        targetProfileKey: string
        settings?: { settings?: { autoCapture?: boolean } }
      }

      await setRelaySession({
        apiBase: payload.apiBase,
        token: payload.token,
        projectId: payload.projectId,
        targetProfileKey: payload.targetProfileKey,
        connected: true,
        autoCapture: payload.settings?.settings?.autoCapture ?? true,
        limitedMode: false,
        lastStatus: "Extension connected."
      })

      sendResponse({ ok: true })
    } catch (cause) {
      sendResponse({
        ok: false,
        reason: cause instanceof Error ? cause.message : "Extension pairing failed."
      })
    }
  })()

  return true
})
