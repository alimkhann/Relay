"use client";

import { useState, useTransition } from "react";

import type { UserSettingsRow } from "@relay/shared";

import { deleteAccountAction } from "@/components/auth/delete-account-action";
import { signOutAction } from "@/components/auth/sign-out-action";
import { useTheme } from "@/components/theme-provider";
import { createClientFlowId } from "@/lib/telemetry/client";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import { cn } from "@/lib/cn";

interface SettingsPreferencesProps {
  initialSettings: UserSettingsRow["settings"];
  hasConnectedExtension: boolean;
}

const platformOptions = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "grok", label: "Grok" },
  { key: "perplexity", label: "Perplexity" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "codex", label: "Codex" },
] as const;

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-[var(--relay-line-strong)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function SettingsPreferences({
  initialSettings,
  hasConnectedExtension,
}: SettingsPreferencesProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { theme, setTheme } = useTheme();

  async function save(nextSettings: typeof settings) {
    const flowId = createClientFlowId("settings");
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
    });
    if (!response.ok) throw new Error("Save failed");
  }

  function update(nextSettings: typeof settings, message: string) {
    const previousSettings = settings;
    setSettings(nextSettings);
    startTransition(async () => {
      try {
        await save(nextSettings);
        setToast(message);
        setTimeout(() => setToast(null), 2000);
      } catch (error) {
        setSettings(previousSettings);
        setToast(error instanceof Error ? error.message : "Save failed");
        setTimeout(() => setToast(null), 3000);
      }
    });
  }

  return (
    <div className="space-y-4 max-w-2xl pt-6">
      {/* ─── Appearance ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Appearance</h2>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Choose your preferred color scheme.
          </p>
        </div>
        <div className="border-t border-[var(--relay-line)] px-5 py-4">
          <div className="flex gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
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
      </section>

      {/* ─── Connection ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Chrome extension</h2>
        </div>
        <div className="border-t border-[var(--relay-line)] px-5 py-4">
          {hasConnectedExtension ? (
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
              <div className="space-y-1">
                <p className="text-[15px] font-medium text-[var(--relay-ink)]">
                  Chrome extension connected
                </p>
                <p className="text-[13px] leading-relaxed text-[var(--relay-muted)]">
                  Relay already has an active browser connection for this account.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[15px] leading-relaxed text-[var(--relay-muted)]">
              Open the Relay sidepanel in Chrome and tap{" "}
              <strong className="text-[var(--relay-ink)] font-semibold">Connect</strong> to pair
              your browser.
            </p>
          )}
        </div>
      </section>

      {/* ─── Platforms ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Platforms</h2>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Choose which AI chats Relay watches.
          </p>
        </div>
        <div className="border-t border-[var(--relay-line)] divide-y divide-[var(--relay-line)]">
          {platformOptions.map((platform) => {
            const checked = settings.enabledPlatforms.includes(platform.key);
            return (
              <div
                key={platform.key}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <span className="text-[15px] font-medium text-[var(--relay-ink)]">{platform.label}</span>
                <Toggle
                  checked={checked}
                  disabled={pending}
                  onChange={(on) => {
                    const enabledPlatforms = on
                      ? [...settings.enabledPlatforms, platform.key]
                      : settings.enabledPlatforms.filter(
                          (p) => p !== platform.key,
                        );
                    update(
                      { ...settings, enabledPlatforms },
                      `${platform.label} ${on ? "enabled" : "disabled"}`,
                    );
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Behavior ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Behavior</h2>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Fine-tune how Relay runs in the background.
          </p>
        </div>
        <div className="border-t border-[var(--relay-line)] divide-y divide-[var(--relay-line)]">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-[15px] font-medium text-[var(--relay-ink)]">Auto-capture</p>
              <p className="text-sm text-[var(--relay-muted)] mt-0.5">
                Save chat content automatically.
              </p>
            </div>
            <Toggle
              checked={settings.autoCapture}
              disabled={pending}
              onChange={(on) =>
                update(
                  { ...settings, autoCapture: on },
                  `Auto-capture ${on ? "on" : "off"}`,
                )
              }
            />
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div>
              <p className="text-[15px] font-medium text-[var(--relay-ink)]">Inline chip</p>
              <p className="text-sm text-[var(--relay-muted)] mt-0.5">
                Show a brief-insert chip on new chats.
              </p>
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
      </section>

      {/* ─── Offline fallback ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Offline fallback</h2>
        </div>
        <div className="border-t border-[var(--relay-line)] px-5 py-4">
          <p className="text-[15px] leading-relaxed text-[var(--relay-muted)]">
            When AI is unavailable, Relay inserts a bounded brief from saved
            project context.
          </p>
        </div>
      </section>

      {/* ─── Account: Sign out ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Account</h2>
        </div>
        <div className="border-t border-[var(--relay-line)] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[15px] font-medium text-[var(--relay-ink)]">Sign out</p>
            <p className="text-sm text-[var(--relay-muted)] mt-0.5">
              End your current session.
            </p>
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
      </section>

      {/* ─── Danger zone ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-danger)]/20 bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-danger)]">Danger zone</h2>
        </div>
        <div className="border-t border-[var(--relay-danger)]/20 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-medium text-[var(--relay-ink)]">Delete account</p>
            <p className="text-sm text-[var(--relay-muted)] mt-0.5">
              Permanently delete your account, projects, and all data. This cannot be undone.
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

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 shadow-[var(--relay-shadow-lg)]">
            <h3 className="text-base font-semibold text-[var(--relay-ink)]">
              Delete account?
            </h3>
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

      {/* ─── Toast ─── */}
      {(toast || pending) && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-5 py-2.5 text-[13px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {pending ? "Saving…" : toast}
        </div>
      )}
    </div>
  );
}
