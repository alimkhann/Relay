"use client";

import { useEffect } from "react";

import { ErrorView } from "@/components/ui/error-view";
import { logClientEvent } from "@/lib/telemetry/client";
import { reportClientError } from "@/lib/telemetry/client-error-reporting";

export default function ActivityError({
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
      message: error.message || "Activity error boundary triggered.",
      error,
      context: { digest: error.digest ?? null, route: "activity" },
    } as const;

    logClientEvent(payload);
    reportClientError(payload);
  }, [error]);

  return (
    <ErrorView
      kicker="Activity"
      title="Couldn't load activity"
      description="Something went wrong fetching recent activity. Try again, or reload if it persists."
      onRetry={reset}
    />
  );
}
