"use client";

import { useState, useTransition } from "react";

import type { UserSettingsRow } from "@relay/shared";

import { createClientFlowId } from "@/lib/telemetry/client";
import { relayClientFetch } from "@/lib/telemetry/fetch";

interface SettingsPreferencesProps {
  initialSettings: UserSettingsRow["settings"];
}

const platformOptions = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "codex", label: "Codex" },
  { key: "perplexity", label: "Perplexity" },
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
        checked ? "bg-[var(--relay-accent)]" : "bg-[var(--relay-line-strong)]"
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
}: SettingsPreferencesProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    setSettings(nextSettings);
  }

  function update(nextSettings: typeof settings, message: string) {
    startTransition(async () => {
      try {
        await save(nextSettings);
        setToast(message);
        setTimeout(() => setToast(null), 2000);
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Save failed");
        setTimeout(() => setToast(null), 3000);
      }
    });
  }

  return (
    <div className="space-y-12 max-w-2xl pt-6">
      {/* ─── Connection ─── */}
      <section className="border-t border-[var(--relay-line)] pt-8">
        <h2 className="text-sm font-medium tracking-wide uppercase text-[var(--relay-ink)]">Chrome extension</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          Open the Relay sidepanel in Chrome and tap{" "}
          <strong className="text-[var(--relay-ink)] font-semibold">Connect</strong> to pair
          your browser.
        </p>
      </section>

      {/* ─── Platforms ─── */}
      <section className="border-t border-[var(--relay-line)] pt-8">
        <h2 className="text-sm font-medium tracking-wide uppercase text-[var(--relay-ink)]">Platforms</h2>
        <p className="mt-1 text-[15px] text-[var(--relay-muted)]">
          Choose which AI chats Relay watches.
        </p>
        <div className="mt-6 divide-y divide-[var(--relay-line)] border-y border-[var(--relay-line)]">
          {platformOptions.map((platform) => {
            const checked = settings.enabledPlatforms.includes(platform.key);
            return (
              <div
                key={platform.key}
                className="flex items-center justify-between py-4"
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
      <section className="border-t border-[var(--relay-line)] pt-8">
        <h2 className="text-sm font-medium tracking-wide uppercase text-[var(--relay-ink)]">Behavior</h2>
        <p className="mt-1 text-[15px] text-[var(--relay-muted)]">
          Fine-tune how Relay runs in the background.
        </p>
        <div className="mt-6 divide-y divide-[var(--relay-line)] border-y border-[var(--relay-line)]">
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-[15px] font-medium text-[var(--relay-ink)]">Auto-capture</p>
              <p className="text-sm text-[var(--relay-muted)] mt-1">
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
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-[15px] font-medium text-[var(--relay-ink)]">Inline chip</p>
              <p className="text-sm text-[var(--relay-muted)] mt-1">
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

      {/* ─── Fallback note ─── */}
      <section className="border-t border-[var(--relay-line)] pt-8 pb-10">
        <h2 className="text-sm font-medium tracking-wide uppercase text-[var(--relay-ink)]">Offline fallback</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          When AI is unavailable, Relay inserts a bounded brief from saved
          project context.
        </p>
      </section>

      {/* ─── Toast ─── */}
      {(toast || pending) && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-5 py-2.5 text-[13px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {pending ? "Saving…" : toast}
        </div>
      )}
    </div>
  );
}
