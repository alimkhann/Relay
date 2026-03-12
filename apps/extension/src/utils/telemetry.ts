import type { TelemetryEventInput, TelemetrySurface } from "@relay/shared";
import { createFlowId, sanitizeTelemetryEvent } from "@relay/shared";

export function createExtensionFlowId(prefix = "ext") {
  return createFlowId(prefix);
}

export function logExtensionEvent(
  input: Omit<TelemetryEventInput, "surface"> & { surface: TelemetrySurface },
) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  void chrome.runtime
    .sendMessage({
      type: "RELAY_LOG_TELEMETRY",
      payload: sanitizeTelemetryEvent(input),
    })
    .catch(() => {
      // Best-effort logging only.
    });
}
