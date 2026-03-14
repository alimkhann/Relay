"use client";

import { useEffect } from "react";

import { logClientEvent } from "@/lib/telemetry/client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientEvent({
      level: "error",
      surface: "web-dashboard",
      area: "page",
      event: "app.error_boundary_triggered",
      message: error.message || "App route error boundary triggered.",
      error,
      context: {
        digest: error.digest ?? null,
      },
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--relay-bg)] px-6 text-[var(--relay-ink)]">
      <div className="w-full max-w-md rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6 shadow-[var(--relay-shadow-lg)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">
          Relay
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Something failed while loading this page.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--relay-muted)]">
          Retry the request. If it fails again, refresh the page and check the latest deployment logs.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 text-sm font-medium text-[var(--relay-bg)] transition hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
