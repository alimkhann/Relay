"use client";

import { useEffect, useState } from "react";
import { detectInAppBrowser, buildAndroidChromeIntent } from "@/lib/utils/in-app-browser";
import { logClientEvent } from "@/lib/telemetry/client";

export function InAppBrowserBanner() {
  const [platform, setPlatform] = useState<"ios" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const detected = detectInAppBrowser();
    if (!detected) return;

    logClientEvent({
      level: "info",
      surface: "web-auth",
      area: "auth",
      event: "in_app_browser.detected",
      message: "User is in an in-app browser where Google OAuth is blocked.",
      context: { platform: detected },
    });

    if (detected === "android") {
      logClientEvent({
        level: "info",
        surface: "web-auth",
        area: "auth",
        event: "google_sign_in.in_app_redirect",
        message: "Redirecting Android in-app browser to Chrome.",
        context: { platform: "android" },
      });
      window.location.href = buildAndroidChromeIntent(window.location.href);
      return;
    }

    setPlatform("ios");
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied — user can still manually copy
    }
  }

  if (!platform) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="rounded-2xl bg-[var(--relay-ink)] px-5 py-4 shadow-2xl">
        <p className="text-sm font-semibold text-[var(--relay-bg)]">
          Open in Safari to continue
        </p>
        <p className="mt-1 text-xs text-[var(--relay-bg)]/70 leading-relaxed">
          Google sign-in is blocked in Threads' browser.
          Tap <strong className="text-[var(--relay-bg)]">···</strong> at the top right → <strong className="text-[var(--relay-bg)]">Open in Safari</strong>.
        </p>
        <button
          type="button"
          onClick={copyLink}
          className="mt-3 w-full rounded-xl bg-[var(--relay-bg)]/15 py-2.5 text-xs font-medium text-[var(--relay-bg)] transition active:opacity-70"
        >
          {copied ? "Link copied ✓" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
