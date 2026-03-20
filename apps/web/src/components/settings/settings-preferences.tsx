"use client"

import { useMemo, useState, useTransition } from "react"
import type { ExtensionApiTokenRow, UserSettingsRow } from "@relay/shared"

import ClaudeIcon from "@lobehub/icons/es/Claude"
import CodexIcon from "@lobehub/icons/es/Codex"
import DeepSeekIcon from "@lobehub/icons/es/DeepSeek"
import GeminiIcon from "@lobehub/icons/es/Gemini"
import GrokIcon from "@lobehub/icons/es/Grok"
import OpenAIIcon from "@lobehub/icons/es/OpenAI"
import PerplexityIcon from "@lobehub/icons/es/Perplexity"

import { deleteAccountAction } from "@/components/auth/delete-account-action"
import { signOutAction } from "@/components/auth/sign-out-action"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/cn"
import { createClientFlowId } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface SettingsPreferencesProps {
  initialSettings: UserSettingsRow["settings"]
  hasConnectedExtension: boolean
  initialTokens: ExtensionApiTokenRow[]
  section: "app" | "integrations" | "account"
  viewer?: { displayName: string | null; email: string | null }
}

const EXTENSION_VERSION = "0.1.0"
const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/search/Relay"

const platformOptions = [
  { key: "chatgpt", label: "ChatGPT", icon: OpenAIIcon },
  { key: "claude", label: "Claude", icon: ClaudeIcon },
  { key: "gemini", label: "Gemini", icon: GeminiIcon },
  { key: "grok", label: "Grok", icon: GrokIcon },
  { key: "perplexity", label: "Perplexity", icon: PerplexityIcon },
  { key: "deepseek", label: "DeepSeek", icon: DeepSeekIcon },
  { key: "codex", label: "Codex", icon: CodexIcon },
] as const

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors",
        checked ? "bg-emerald-500" : "bg-[var(--relay-line-strong)]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  )
}

function SettingsSection({
  title,
  description,
  children,
  id,
}: {
  title: string
  description?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--relay-ink)]">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-[var(--relay-muted)]">{description}</p> : null}
      </div>
      <div className="border-t border-[var(--relay-line)]">{children}</div>
    </section>
  )
}

function inferTokenType(label: string): { type: string; className: string } {
  const lower = label.toLowerCase()
  if (lower.includes("cli")) return { type: "CLI", className: "text-blue-500 bg-blue-500/10" }
  if (lower.includes("mac") || lower.includes("mcp")) return { type: "MCP", className: "text-violet-500 bg-violet-500/10" }
  return { type: "API", className: "text-[var(--relay-muted)] bg-[var(--relay-soft)]" }
}

export function SettingsPreferences({
  initialSettings,
  hasConnectedExtension,
  initialTokens,
  section,
  viewer,
}: SettingsPreferencesProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [tokenPending, setTokenPending] = useState(false)
  const [tokens, setTokens] = useState<ExtensionApiTokenRow[]>(initialTokens)
  const [newTokenName, setNewTokenName] = useState("")
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const { theme, setTheme } = useTheme()

  const latestToken = useMemo(() => tokens[0] ?? null, [tokens])

  function showToast(message: string, timeout = 2000) {
    setToast(message)
    setTimeout(() => setToast(null), timeout)
  }

  async function save(nextSettings: typeof settings) {
    const flowId = createClientFlowId("settings")
    const response = await relayClientFetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      telemetry: {
        surface: "web-dashboard",
        area: "settings",
        event: "settings.save",
        flowId,
        logSuccess: true,
      },
      body: JSON.stringify(nextSettings),
    })

    if (!response.ok) {
      throw new Error("Save failed")
    }
  }

  function update(nextSettings: typeof settings, message: string) {
    const previous = settings
    setSettings(nextSettings)

    startTransition(async () => {
      try {
        await save(nextSettings)
        showToast(message)
      } catch (error) {
        setSettings(previous)
        showToast(error instanceof Error ? error.message : "Save failed", 3000)
      }
    })
  }

  async function createToken() {
    if (!newTokenName.trim() || tokenPending) return

    setTokenPending(true)

    try {
      const flowId = createClientFlowId("settings")
      const response = await relayClientFetch("/api/extension/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        telemetry: {
          surface: "web-dashboard",
          area: "settings",
          event: "token.create",
          flowId,
          logSuccess: true,
        },
        body: JSON.stringify({ deviceName: newTokenName.trim() }),
      })

      if (!response.ok) {
        throw new Error("Failed to create token")
      }

      const data = (await response.json()) as { token: string; record: ExtensionApiTokenRow }
      setTokens((prev) => [data.record, ...prev])
      setIssuedToken(data.token)
      setNewTokenName("")
      showToast("Token created")
    } catch {
      showToast("Failed to create token", 3000)
    } finally {
      setTokenPending(false)
    }
  }

  async function revokeToken(tokenId: string) {
    setTokenPending(true)

    try {
      const flowId = createClientFlowId("settings")
      const response = await relayClientFetch(`/api/extension/tokens/${tokenId}`, {
        method: "DELETE",
        telemetry: {
          surface: "web-dashboard",
          area: "settings",
          event: "token.revoke",
          flowId,
          logSuccess: true,
        },
      })

      if (!response.ok) {
        throw new Error("Failed to revoke token")
      }

      setTokens((prev) => prev.filter((token) => token.id !== tokenId))
      setConfirmRevokeId(null)
      showToast("Token revoked")
    } catch {
      showToast("Failed to revoke token", 3000)
    } finally {
      setTokenPending(false)
    }
  }

  return (
    <div className="space-y-4 pt-6">
      {section === "app" ? (
        <>
          <SettingsSection title="Appearance" description="Choose your preferred color scheme.">
            <div className="px-5 py-4">
              <div className="flex flex-wrap gap-2">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value as "light" | "dark" | "system")}
                    className={cn(
                      "rounded-[var(--relay-radius-sm)] border px-4 py-2 text-[13px] font-medium transition-colors",
                      theme === option.value
                        ? "border-[var(--relay-accent)] bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                        : "border-[var(--relay-line)] text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Platforms" description="Choose which AI chats Relay watches.">
            <div className="divide-y divide-[var(--relay-line)]">
              {platformOptions.map((platform) => {
                const checked = settings.enabledPlatforms.includes(platform.key)
                const Icon = platform.icon

                return (
                  <div key={platform.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--relay-soft)] text-[var(--relay-ink)]">
                        <Icon size={16} />
                      </span>
                      <span className="text-[15px] font-medium text-[var(--relay-ink)]">{platform.label}</span>
                    </div>
                    <Toggle
                      checked={checked}
                      disabled={pending}
                      onChange={(on) => {
                        const enabledPlatforms = on
                          ? [...settings.enabledPlatforms, platform.key]
                          : settings.enabledPlatforms.filter((candidate) => candidate !== platform.key)

                        update(
                          { ...settings, enabledPlatforms },
                          `${platform.label} ${on ? "enabled" : "disabled"}`,
                        )
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </SettingsSection>

          <SettingsSection title="Behavior" description="Fine-tune how Relay runs in the background.">
            <div className="divide-y divide-[var(--relay-line)]">
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-[15px] font-medium text-[var(--relay-ink)]">Auto-capture</p>
                  <p className="mt-0.5 text-sm text-[var(--relay-muted)]">Save chat content automatically.</p>
                </div>
                <Toggle
                  checked={settings.autoCapture}
                  disabled={pending}
                  onChange={(on) => update({ ...settings, autoCapture: on }, `Auto-capture ${on ? "on" : "off"}`)}
                />
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-[15px] font-medium text-[var(--relay-ink)]">Inline chip</p>
                  <p className="mt-0.5 text-sm text-[var(--relay-muted)]">Show a brief-insert chip on new chats.</p>
                </div>
                <Toggle
                  checked={settings.showSidepanelOnSupportedSites}
                  disabled={pending}
                  onChange={(on) =>
                    update(
                      { ...settings, showSidepanelOnSupportedSites: on },
                      `Inline chip ${on ? "on" : "off"}`,
                    )
                  }
                />
              </div>
            </div>
          </SettingsSection>

          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-5 py-4">
            <p className="text-[13px] font-medium text-[var(--relay-ink)]">Offline fallback</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--relay-muted)]">
              When AI is unavailable, Relay inserts a bounded brief from saved project context. This is
              currently automatic and does not need separate configuration.
            </p>
          </div>
        </>
      ) : null}

      {section === "integrations" ? (
        <>
          <SettingsSection title="Chrome extension" description="Monitor connection status and browser setup.">
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("inline-block h-2.5 w-2.5 rounded-full", hasConnectedExtension ? "bg-emerald-500" : "bg-[var(--relay-faint)]")} />
                    <p className="text-[15px] font-medium text-[var(--relay-ink)]">
                      {hasConnectedExtension ? "Chrome extension connected" : "Chrome extension not connected"}
                    </p>
                    <span className="rounded-full border border-[var(--relay-line)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--relay-muted)]">
                      v{EXTENSION_VERSION}
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--relay-muted)]">
                    {hasConnectedExtension
                      ? latestToken
                        ? `Connected with ${latestToken.deviceName}. Open the extension sidebar in Chrome to reconnect or switch projects.`
                        : "Relay already has an active browser connection for this account."
                      : "Open the Relay extension sidebar in Chrome and sign in there to connect your browser."}
                  </p>
                </div>

                <a
                  href={CHROME_WEB_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-gray-50 dark:bg-[var(--relay-surface)] dark:hover:bg-[var(--relay-soft)]"
                >
                  Chrome Web Store
                </a>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection id="settings-api-tokens" title="API tokens" description="Create tokens for Relay MCP, the CLI, or manual integrations.">
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(event) => setNewTokenName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void createToken()
                    }
                  }}
                  placeholder="Device or label name"
                  className="flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 text-[13px] text-[var(--relay-ink)] placeholder:text-[var(--relay-muted)] focus:border-[var(--relay-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void createToken()}
                  disabled={!newTokenName.trim() || tokenPending}
                  className="shrink-0 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
                >
                  {tokenPending ? "Working..." : "Create token"}
                </button>
              </div>

              {issuedToken ? (
                <div className="space-y-2 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-soft)] p-3">
                  <p className="text-[13px] font-medium text-[var(--relay-ink)]">
                    Token created. Copy it now — it won&apos;t be shown again.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="flex-1 break-all rounded border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 text-[12px] font-mono text-[var(--relay-ink)]">
                      {issuedToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(issuedToken)
                        setTokenCopied(true)
                        setTimeout(() => setTokenCopied(false), 2000)
                      }}
                      className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-bg)]"
                    >
                      {tokenCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIssuedToken(null)}
                    className="text-[12px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              {tokens.length > 0 ? (
                <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)]">
                  {tokens.map((token) => (
                    <div key={token.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-medium text-[var(--relay-ink)]">{token.deviceName}</p>
                          {(() => {
                            const badge = inferTokenType(token.deviceName)
                            return (
                              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", badge.className)}>
                                {badge.type}
                              </span>
                            )
                          })()}
                        </div>
                        <p className="text-[12px] text-[var(--relay-muted)]">
                          <span className="font-mono">{token.tokenPrefix}...</span>
                          {" · "}
                          Created {new Date(token.createdAt).toLocaleDateString()}
                          {token.lastUsedAt ? (
                            <>
                              {" · "}
                              Last used {new Date(token.lastUsedAt).toLocaleDateString()}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(token.id)}
                        disabled={tokenPending}
                        className="shrink-0 rounded-[var(--relay-radius-sm)] border border-[var(--relay-danger)]/30 px-3 py-1.5 text-[12px] font-medium text-[var(--relay-danger)] transition hover:bg-[var(--relay-danger)]/10 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[var(--relay-muted)]">No active tokens yet.</p>
              )}
            </div>
          </SettingsSection>
        </>
      ) : null}

      {section === "account" ? (
        <>
          {viewer ? (
            <SettingsSection title="Profile">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--relay-accent)] text-[var(--relay-bg)] text-sm font-semibold shrink-0">
                  {(viewer.displayName ?? viewer.email ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  {viewer.displayName ? (
                    <p className="text-[15px] font-medium text-[var(--relay-ink)]">{viewer.displayName}</p>
                  ) : null}
                  {viewer.email ? (
                    <p className="text-[13px] text-[var(--relay-muted)] truncate">{viewer.email}</p>
                  ) : null}
                </div>
              </div>
            </SettingsSection>
          ) : null}

          <SettingsSection title="Account">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-[15px] font-medium text-[var(--relay-ink)]">Sign out</p>
                <p className="mt-0.5 text-sm text-[var(--relay-muted)]">End your current session.</p>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </SettingsSection>

          <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-danger)]/20 bg-[var(--relay-surface)]">
            <div className="px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--relay-danger)]">Danger zone</h2>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-[var(--relay-danger)]/20 px-5 py-4">
              <div>
                <p className="text-[15px] font-medium text-[var(--relay-ink)]">Delete account</p>
                <p className="mt-0.5 text-sm text-[var(--relay-muted)]">
                  Permanently delete your account, projects, and all data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="shrink-0 rounded-[var(--relay-radius-sm)] border border-[var(--relay-danger)]/30 bg-[var(--relay-danger)]/10 px-4 py-2 text-[13px] font-medium text-[var(--relay-danger)] transition hover:bg-[var(--relay-danger)]/20"
              >
                Delete account
              </button>
            </div>
          </section>
        </>
      ) : null}

      {confirmRevokeId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 shadow-[var(--relay-shadow-lg)]">
            <h3 className="text-base font-semibold text-[var(--relay-ink)]">Revoke token?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--relay-muted)]">
              Any integration using this token will immediately lose access.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmRevokeId(null)}
                className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void revokeToken(confirmRevokeId)}
                disabled={tokenPending}
                className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-danger)]/30 bg-[var(--relay-danger)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Revoke token
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 shadow-[var(--relay-shadow-lg)]">
            <h3 className="text-base font-semibold text-[var(--relay-ink)]">Delete account?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--relay-muted)]">
              This permanently deletes your Relay account, projects, captures, memory, settings, and extension connections. This cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)]"
              >
                Cancel
              </button>
              <form action={deleteAccountAction}>
                <button
                  type="submit"
                  className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-danger)]/30 bg-[var(--relay-danger)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
                >
                  Delete account
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {(toast || pending) ? (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-5 py-2.5 text-[13px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {pending ? "Saving..." : toast}
        </div>
      ) : null}
    </div>
  )
}
