"use client"

import { useEffect, useState } from "react"
import { CalendarDays, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import { logClientEvent } from "@/lib/telemetry/client"

interface GoogleStatus {
  configured: boolean
  connected: boolean
  email: string | null
  scopes: string[]
}

/** Google (Gmail + Calendar) connect card for Settings → Integrations. */
export function GoogleIntegrationCard() {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetch("/api/integrations/google")
      .then(async (res) => (res.ok ? ((await res.json()) as GoogleStatus) : null))
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  if (!status?.configured) return null

  const hasGmail = status.scopes.some((scope) => scope.includes("gmail"))
  const hasCalendar = status.scopes.some((scope) => scope.includes("calendar"))

  async function disconnect() {
    setBusy(true)
    try {
      await fetch("/api/integrations/google", { method: "DELETE" })
      setStatus((prev) => (prev ? { ...prev, connected: false, email: null, scopes: [] } : prev))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Google — Gmail & Calendar</h2>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Let Relay read your calendar and email, prepare you for meetings, draft replies, create
          events, and send mail — every change asks for your confirmation first.
        </p>
      </div>
      <div className="border-t border-[var(--relay-line)] px-5 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full",
                  status.connected ? "bg-emerald-500" : "bg-[var(--relay-faint)]",
                )}
              />
              <p className="text-[15px] font-medium text-[var(--relay-ink)]">
                {status.connected ? `Connected as ${status.email}` : "Not connected"}
              </p>
            </div>
            {status.connected ? (
              <div className="flex items-center gap-3 text-[12px] text-[var(--relay-muted)]">
                {hasCalendar ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> Calendar
                  </span>
                ) : null}
                {hasGmail ? (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3.5" /> Gmail
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-[var(--relay-muted)]">
                Available to the Relay agent everywhere — dashboard, extension, and Telegram.
              </p>
            )}
          </div>
          {status.connected ? (
            <Button variant="secondary" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => {
                logClientEvent({
                  level: "info",
                  surface: "web-settings",
                  area: "integrations",
                  event: "integration_connect_clicked",
                  message: "Google connect clicked.",
                  context: { provider: "google" },
                })
                window.location.href = "/api/integrations/google/connect"
              }}
            >
              Connect Google
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
