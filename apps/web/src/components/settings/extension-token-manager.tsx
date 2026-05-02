"use client"

import { useState } from "react"

import type { ExtensionApiTokenRow } from "@relay/shared"

import { Button } from "@/components/ui/button"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface ExtensionTokenManagerProps {
  initialTokens: ExtensionApiTokenRow[]
  appUrl: string
}

export function ExtensionTokenManager({ initialTokens, appUrl }: ExtensionTokenManagerProps) {
  const [tokens, setTokens] = useState(initialTokens)
  const [deviceName, setDeviceName] = useState("Chrome on this Mac")
  const [issuedToken, setIssuedToken] = useState("")
  const [status, setStatus] = useState("Create a token, paste it into the extension once, then pick a project.")
  const [pending, setPending] = useState(false)

  async function createToken() {
    setPending(true)
    setStatus("Creating token…")
    const flowId = createClientFlowId("ext-token")

    try {
      const response = await relayClientFetch("/api/extension/tokens", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        telemetry: {
          surface: "web-dashboard",
          area: "extension",
          event: "extension_token.create",
          flowId,
          context: {
            deviceName
          },
          logSuccess: true
        },
        body: JSON.stringify({ deviceName })
      })

      if (!response.ok) {
        throw new Error("Token creation failed.")
      }

      const result = (await response.json()) as {
        token: string
        record: ExtensionApiTokenRow
      }

      setIssuedToken(result.token)
      setTokens((current) => [result.record, ...current])
      logClientEvent({
        level: "info",
        surface: "web-dashboard",
        area: "extension",
        event: "extension_token.created",
        flowId,
        message: `Created extension token ${result.record.id}.`,
        context: {
          tokenId: result.record.id
        }
      })
      setStatus("Token created. Copy it now, because the full value is only shown once.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Token creation failed.")
    } finally {
      setPending(false)
    }
  }

  async function revokeToken(tokenId: string) {
    setPending(true)
    setStatus("Revoking token…")
    const flowId = createClientFlowId("ext-token")

    try {
      const response = await relayClientFetch(`/api/extension/tokens/${tokenId}`, {
        method: "DELETE",
        telemetry: {
          surface: "web-dashboard",
          area: "extension",
          event: "extension_token.revoke",
          flowId,
          context: {
            tokenId
          },
          logSuccess: true
        }
      })

      if (!response.ok) {
        throw new Error("Token revoke failed.")
      }

      setTokens((current) => current.filter((token) => token.id !== tokenId))
      setStatus("Token revoked.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Token revoke failed.")
    } finally {
      setPending(false)
    }
  }

  async function copyIssuedToken() {
    if (!issuedToken) return
    await navigator.clipboard.writeText(issuedToken)
    logClientEvent({
      level: "info",
      surface: "web-dashboard",
      area: "extension",
      event: "extension_token.copied",
      message: "Copied one-time extension token to the clipboard."
    })
    setStatus("Token copied. In the extension, set API base and paste the token once.")
  }

  return (
    <div className="space-y-6 rounded-[28px] border border-[var(--relay-line)] bg-white/86 p-6 shadow-[var(--relay-shadow)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Extension access</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Connect Chrome once</h2>
        </div>
        <div className="rounded-full border border-[var(--relay-line)] bg-[var(--relay-soft)] px-4 py-2 text-sm text-[var(--relay-muted)]">
          API base: {appUrl}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--relay-muted)]">Device name</span>
          <input
            className="w-full rounded-[18px] border border-[var(--relay-line)] bg-white px-4 py-3 text-[var(--relay-ink)] outline-none ring-0 transition focus:border-[var(--relay-accent)]"
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
          />
        </label>
        <Button disabled={pending} onClick={() => void createToken()}>
          {pending ? "Working…" : "Create extension token"}
        </Button>
      </div>

      {issuedToken ? (
        <div className="rounded-[24px] border border-[#d6dfcc] bg-[var(--relay-soft)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">One-time token</p>
          <p className="mt-3 break-all font-mono text-sm text-[var(--relay-ink)]">{issuedToken}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void copyIssuedToken()}>
              Copy token
            </Button>
            <a
              className="inline-flex items-center rounded-full border border-[var(--relay-line)] px-4 py-2 text-sm font-medium text-[var(--relay-muted)] transition hover:bg-white"
              href="/dashboard">
              Back to dashboard
            </a>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "Create a token here."],
          ["2", `Set API base to ${appUrl}.`],
          ["3", "Paste the token in the extension and pick a project."]
        ].map(([step, copy]) => (
          <div key={step} className="rounded-[22px] border border-[var(--relay-line)] bg-white/70 p-4">
            <p className="text-sm font-semibold text-[var(--relay-accent)]">Step {step}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">{copy}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--relay-ink)]">Issued tokens</p>
          <p className="text-sm text-[var(--relay-muted)]">{tokens.length} active or historical token(s)</p>
        </div>
        <div className="space-y-3">
          {tokens.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[var(--relay-line)] bg-white/55 p-5 text-sm text-[var(--relay-muted)]">
              No extension tokens yet.
            </div>
          ) : (
            tokens.map((token) => (
              <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[var(--relay-line)] bg-white/70 p-4">
                <div>
                  <p className="font-medium text-[var(--relay-ink)]">{token.deviceName}</p>
                  <p className="mt-1 text-sm text-[var(--relay-muted)]">
                    {token.tokenPrefix}… · {token.revokedAt ? "Revoked" : "Active"}
                  </p>
                </div>
                <Button variant="secondary" disabled={pending || Boolean(token.revokedAt)} onClick={() => void revokeToken(token.id)}>
                  {token.revokedAt ? "Revoked" : "Revoke"}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="rounded-[18px] bg-[#eef4ea] px-4 py-3 text-sm text-[var(--relay-muted)]">{status}</p>
    </div>
  )
}
