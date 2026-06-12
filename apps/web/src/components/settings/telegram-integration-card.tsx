"use client"

import { useEffect, useState } from "react"
import { Check, Copy, ExternalLink, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface TelegramStatus {
  configured: boolean
  botUsername: string | null
  connected: boolean
  accountLabel: string | null
}

/** Telegram connect card for Settings → Integrations. No API token needed from you —
 * Relay generates a one-time pairing code; paste it into @onrelay_bot. */
export function TelegramIntegrationCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [pairing, setPairing] = useState<{ code: string; deepLink: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch("/api/integrations/telegram")
      .then(async (res) => (res.ok ? ((await res.json()) as TelegramStatus) : null))
      .then((data) => setStatus(data))
      .catch(() => setStatus(null))
  }, [])

  async function generateCode() {
    setBusy(true)
    setError(null)
    try {
      const response = await relayClientFetch("/api/integrations/telegram", {
        method: "POST",
        telemetry: {
          surface: "web-settings",
          area: "integrations",
          event: "integration_connect_clicked",
          context: { provider: "telegram" },
          logSuccess: true,
        },
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "Couldn't create a connect code.")
      }
      const data = (await response.json()) as { code: string; deepLink: string | null }
      setPairing({ code: data.code, deepLink: data.deepLink })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create a connect code.")
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await fetch("/api/integrations/telegram", { method: "DELETE" })
      setStatus((prev) => (prev ? { ...prev, connected: false, accountLabel: null } : prev))
      setPairing(null)
    } finally {
      setBusy(false)
    }
  }

  const botHandle = status?.botUsername ? `@${status.botUsername}` : "@onrelay_bot"
  const botUrl = status?.botUsername
    ? `https://t.me/${status.botUsername}`
    : "https://t.me/onrelay_bot"

  return (
    <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Telegram</h2>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Talk to your Relay memory from your phone. Ask questions, save memories, recall decisions — counts toward your agent usage.
        </p>
      </div>
      <div className="border-t border-[var(--relay-line)] px-5 py-4">
        {!status?.configured ? (
          <p className="text-[13px] leading-relaxed text-[var(--relay-muted)]">
            Telegram is not enabled on this server yet. An admin needs to set{" "}
            <code className="rounded bg-[var(--relay-soft)] px-1 py-0.5 text-xs">TELEGRAM_BOT_TOKEN</code>{" "}
            and{" "}
            <code className="rounded bg-[var(--relay-soft)] px-1 py-0.5 text-xs">TELEGRAM_WEBHOOK_SECRET</code>{" "}
            in the environment, then register the webhook.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 rounded-full",
                      status.connected ? "bg-emerald-500" : "bg-[var(--relay-faint)]",
                    )}
                  />
                  <p className="text-[15px] font-medium text-[var(--relay-ink)]">
                    {status.connected
                      ? `Connected${status.accountLabel ? ` as ${status.accountLabel}` : ""}`
                      : "Not connected"}
                  </p>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--relay-muted)]">
                  {status.connected
                    ? `Message ${botHandle} on Telegram — it's the full Relay agent.`
                    : "You don't need any token. Relay gives you a one-time connect code — paste it into the bot."}
                </p>
              </div>
              {status.connected ? (
                <Button variant="secondary" disabled={busy} onClick={() => void disconnect()}>
                  Disconnect
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => void generateCode()}>
                  <Send className="mr-1.5 size-3.5" />
                  {pairing ? "New code" : "Get connect code"}
                </Button>
              )}
            </div>

            {!status.connected ? (
              <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[13px] text-[var(--relay-muted)]">
                <li>
                  Click <span className="font-medium text-[var(--relay-ink)]">Get connect code</span> below
                </li>
                <li>
                  Open{" "}
                  <a
                    href={botUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-[var(--relay-accent-blue)] hover:underline"
                  >
                    {botHandle}
                    <ExternalLink className="size-3" />
                  </a>{" "}
                  in Telegram
                </li>
                <li>Paste the code, or use the one-tap link — done</li>
              </ol>
            ) : null}

            {!status.connected && pairing ? (
              <div className="mt-4 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] p-4">
                <p className="text-xs text-[var(--relay-muted)]">
                  Your connect code (expires in 15 minutes):
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-[var(--relay-soft)] px-2.5 py-1.5 font-mono text-sm text-[var(--relay-ink)]">
                    {pairing.code}
                  </code>
                  <button
                    type="button"
                    aria-label="Copy code"
                    onClick={() => {
                      void navigator.clipboard?.writeText(pairing.code)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                    className="rounded p-1.5 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
                  >
                    {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                  </button>
                </div>
                {pairing.deepLink ? (
                  <a
                    href={pairing.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--relay-accent-blue)] hover:underline"
                  >
                    Open {botHandle} with code prefilled
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        {error ? <p className="mt-3 text-xs font-medium text-[var(--relay-danger)]">{error}</p> : null}
      </div>
    </section>
  )
}