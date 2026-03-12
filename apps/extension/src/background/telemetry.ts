import type { TelemetryEventInput } from "@relay/shared/types/telemetry";
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry";

import { getRelaySession } from "../storage/session";

const queue: TelemetryEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;

function scheduleFlush() {
  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBackgroundTelemetry();
  }, 1200);
}

export async function flushBackgroundTelemetry() {
  if (flushInFlight || queue.length === 0) {
    return;
  }

  flushInFlight = true;
  const batch = queue.splice(0, 25);

  try {
    const session = await getRelaySession();
    const response = await fetch(`${session.apiBase}/api/telemetry/logs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      },
      body: JSON.stringify({ logs: batch }),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`Telemetry flush failed with status ${response.status}.`);
    }
  } catch (error) {
    console.error("[Relay BG] telemetry flush failed:", error);
    queue.unshift(...batch);
  } finally {
    flushInFlight = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}

export function recordBackgroundTelemetry(input: TelemetryEventInput) {
  queue.push(sanitizeTelemetryEvent(input));

  if (queue.length >= 10) {
    void flushBackgroundTelemetry();
    return;
  }

  scheduleFlush();
}

export function initializeBackgroundTelemetry() {
  if (typeof self === "undefined" || !("addEventListener" in self)) {
    return;
  }

  self.addEventListener("error", (event) => {
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "runtime",
      event: "background.error",
      message: event.message || "Unhandled background error.",
      error: event.error ?? event.message,
      context: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    });
  });

  self.addEventListener("unhandledrejection", (event) => {
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "runtime",
      event: "background.unhandled_rejection",
      message: "Unhandled background promise rejection.",
      error: event.reason,
    });
  });
}
