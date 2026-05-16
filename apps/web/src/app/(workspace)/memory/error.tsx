"use client";

import { useEffect } from "react";

import { ErrorView } from "@/components/ui/error-view";
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
    <ErrorView
      kicker="Memory"
      title="Couldn't load memory"
      description="Something went wrong fetching project context. Try again, or reload if it persists."
      onRetry={reset}
    />
  );
}
