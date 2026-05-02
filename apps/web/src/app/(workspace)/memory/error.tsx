"use client";

import { useEffect } from "react";

import { logClientEvent } from "@/lib/telemetry/client";
import { reportClientError } from "@/lib/telemetry/client-error-reporting";

export default function MemoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const payload = {
      level: "error",
      area: "page",
      event: "app.error_boundary_triggered",
      message: error.message || "Memory error boundary triggered.",
      error,
      context: { digest: error.digest ?? null, route: "memory" },
    } as const;

    logClientEvent(payload);
    reportClientError(payload);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6 shadow-[var(--relay-shadow-lg)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">
          Memory
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
          Failed to load memory
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--relay-muted)]">
          Something went wrong loading this page. Try again, or refresh if the problem persists.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 text-sm font-medium text-[var(--relay-bg)] transition hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
