import type { TelemetryEventInput } from "@relay/shared/types/telemetry";
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry";

function writeConsoleEvent(event: TelemetryEventInput) {
  const prefix = `[Relay Extension] ${event.surface} ${event.event}`;

  if (event.level === "error") {
    console.error(prefix, event);
    return;
  }

  if (event.level === "warn") {
    console.warn(prefix, event);
    return;
  }

  if (event.level === "debug") {
    console.debug(prefix, event);
    return;
  }

  console.info(prefix, event);
}

export async function flushBackgroundTelemetry() {
  return Promise.resolve();
}

export function recordBackgroundTelemetry(input: TelemetryEventInput) {
  writeConsoleEvent(sanitizeTelemetryEvent(input));
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
