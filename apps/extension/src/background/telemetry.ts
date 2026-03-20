import type { TelemetryEventInput } from "@relay/shared/types/telemetry";
import { buildPosthogEvent } from "@relay/shared/utils/posthog";
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry";

import { getRelaySession } from "../storage/session";

const DISTINCT_ID_STORAGE_KEY = "relay.analyticsDistinctId";

const pendingRequests = new Set<Promise<void>>();

function getPosthogConfig() {
  const key = process.env.PLASMO_PUBLIC_POSTHOG_KEY?.trim();

  if (!key) {
    return null;
  }

  return {
    key,
    host: process.env.PLASMO_PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com",
  };
}

async function getAnonymousDistinctId() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return `extension-${Date.now()}`;
  }

  const stored = await chrome.storage.local.get(DISTINCT_ID_STORAGE_KEY);
  const existing = stored[DISTINCT_ID_STORAGE_KEY];
  if (typeof existing === "string" && existing.length > 0) {
    return existing;
  }

  const nextId = `extension-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ [DISTINCT_ID_STORAGE_KEY]: nextId });
  return nextId;
}

async function getDistinctId() {
  const session = await getRelaySession();
  if (session.userId) {
    return session.userId;
  }

  return getAnonymousDistinctId();
}

function queueBackgroundPosthog(input: TelemetryEventInput) {
  const config = getPosthogConfig();
  if (!config) {
    return;
  }

  const request = (async () => {
    try {
      const payload = buildPosthogEvent(input);
      const distinctId = await getDistinctId();

      await fetch(`${config.host}/capture/`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          api_key: config.key,
          event: payload.event,
          properties: {
            distinct_id: distinctId,
            source: "relay-extension",
            ...payload.properties,
          },
        }),
      });
    } catch {
      // Best-effort analytics only.
    }
  })();

  pendingRequests.add(request);
  void request.finally(() => {
    pendingRequests.delete(request);
  });
}

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
  await Promise.allSettled(Array.from(pendingRequests));
}

export function recordBackgroundTelemetry(input: TelemetryEventInput) {
  const event = sanitizeTelemetryEvent(input);
  writeConsoleEvent(event);
  queueBackgroundPosthog(event);
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
