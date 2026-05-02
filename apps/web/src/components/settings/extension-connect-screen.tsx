"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface ExtensionConnectScreenProps {
  apiBase: string
  extensionId: string
  initialDeviceName: string
}

type RuntimeBridge = {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback?: (response?: { ok?: boolean; reason?: string }) => void
  ) => void
  lastError?: {
    message?: string
  }
}

export function ExtensionConnectScreen({ apiBase, extensionId, initialDeviceName }: ExtensionConnectScreenProps) {
  const [deviceName, setDeviceName] = useState(initialDeviceName)
  const [status, setStatus] = useState("Relay will pair this browser without exposing the device token.")
  const [pending, startTransition] = useTransition()

  async function connect() {
    setStatus("Creating a short-lived pairing grant…")
    const flowId = createClientFlowId("connect")

    const response = await relayClientFetch("/api/extension/connect/start", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      telemetry: {
        surface: "web-dashboard",
        area: "extension",
        event: "extension_connect.start",
        flowId,
        context: {
          extensionId,
          deviceName
        },
        logSuccess: true
      },
      body: JSON.stringify({
        deviceName
      })
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(payload.error ?? "Failed to start extension pairing.")
    }

    const payload = (await response.json()) as {
      grantToken: string
    }

    const browserRuntime =
      typeof window === "undefined" ? null : (window as Window & { chrome?: { runtime?: RuntimeBridge } }).chrome?.runtime ?? null

    if (!browserRuntime?.sendMessage) {
      logClientEvent({
        level: "error",
        surface: "web-dashboard",
        area: "extension",
        event: "extension_connect.runtime_missing",
        flowId,
        message: "Chrome runtime messaging is unavailable in this browser tab."
      })
      throw new Error("Chrome runtime messaging is unavailable in this browser tab.")
    }

    await new Promise<void>((resolve, reject) => {
      browserRuntime.sendMessage?.(
        extensionId,
        {
          type: "RELAY_CONNECT_GRANT",
          payload: {
            grantToken: payload.grantToken,
            apiBase
          }
        },
        (result?: { ok?: boolean; reason?: string }) => {
          const runtimeError = browserRuntime.lastError?.message
          if (runtimeError) {
            logClientEvent({
              level: "error",
              surface: "web-dashboard",
              area: "extension",
              event: "extension_connect.runtime_failed",
              flowId,
              message: runtimeError,
              context: {
                extensionId
              }
            })
            reject(new Error(runtimeError))
            return
          }

          if (!result?.ok) {
            logClientEvent({
              level: "error",
              surface: "web-dashboard",
              area: "extension",
              event: "extension_connect.bridge_failed",
              flowId,
              message: result?.reason ?? "Extension pairing failed.",
              context: {
                extensionId
              }
            })
            reject(new Error(result?.reason ?? "Extension pairing failed."))
            return
          }

          logClientEvent({
            level: "info",
            surface: "web-dashboard",
            area: "extension",
            event: "extension_connect.completed",
            flowId,
            message: "Extension pairing grant was delivered to Chrome."
          })
          resolve()
        }
      )
    })
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
      <div className="rounded-[26px] border border-[var(--relay-line)] bg-[#141714] p-8 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/58">Extension pairing</p>
        <h1 className="mt-4 max-w-sm text-4xl font-semibold tracking-[-0.045em]">Connect Relay in Chrome once, then get out of the way.</h1>
        <p className="mt-4 max-w-md text-base leading-8 text-white/78">
          Relay issues the extension a hidden device token behind the scenes. The normal setup flow no longer exposes raw auth material.
        </p>
      </div>

      <div className="rounded-[26px] border border-[var(--relay-line)] bg-white/88 p-8 shadow-[var(--relay-shadow)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--relay-muted)]">Connect</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Connect Relay in Chrome</h2>
        <p className="mt-3 max-w-xl text-base leading-8 text-[var(--relay-muted)]">
          Chrome will hand the pairing grant directly to the installed Relay extension using external messaging.
        </p>

        <label className="mt-8 grid gap-3 text-sm text-[var(--relay-muted)]">
          <span className="font-medium text-[var(--relay-ink)]">Device name</span>
          <input
            className="rounded-[16px] border border-[var(--relay-line)] bg-[var(--relay-background)] px-4 py-3 text-[var(--relay-ink)] outline-none transition focus:border-[rgba(24,32,23,0.22)]"
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
          />
        </label>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await connect()
                  setStatus("Relay is paired. Return to the sidepanel and refresh once if it is already open.")
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "Extension pairing failed.")
                }
              })
            }>
            {pending ? "Connecting…" : "Connect extension"}
          </Button>
        </div>

        <p className="mt-6 rounded-[18px] bg-[var(--relay-soft)] px-4 py-4 text-sm leading-7 text-[var(--relay-muted)]">{status}</p>
      </div>
    </section>
  )
}
