import type { TelemetryEventInput } from "@relay/shared/types/telemetry";
import { buildPosthogEvent, buildPosthogExceptionProperties, shouldCapturePosthogException } from "@relay/shared/utils/posthog";
import { sanitizeTelemetryEvent } from "@relay/shared/utils/telemetry";

import { getRelaySession } from "../storage/session";

const DISTINCT_ID_STORAGE_KEY = "relay.analyticsDistinctId";
const IDENTIFIED_USER_STORAGE_KEY = "relay.analyticsIdentifiedUserId";

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

function getExtensionRuntimeProperties() {
  const version = typeof chrome !== "undefined" && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest().version
    : null;

  return {
    app_source: "relay-extension",
    app: "extension",
    app_version: version,
    environment: process.env.NODE_ENV === "development" ? "development" : "production",
  };
}

async function queueRawPosthogEvent(input: {
  event: string;
  properties: Record<string, string | number | boolean | null>;
  distinctId?: string | null;
  $set?: Record<string, string | number | boolean | null>;
}) {
  const config = getPosthogConfig();
  if (!config) {
    return;
  }

  const request = (async () => {
    try {
      const distinctId = input.distinctId ?? (await getDistinctId());

      await fetch(`${config.host}/capture/`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          api_key: config.key,
          event: input.event,
          properties: {
            distinct_id: distinctId,
            ...getExtensionRuntimeProperties(),
            ...input.properties,
          },
          ...(input.$set ? { $set: input.$set } : {}),
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

function queueBackgroundPosthog(input: TelemetryEventInput) {
  const config = getPosthogConfig();
  if (!config || input.level === "debug") {
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
            ...getExtensionRuntimeProperties(),
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

function queueBackgroundException(input: TelemetryEventInput) {
  const config = getPosthogConfig();
  if (!config || !shouldCapturePosthogException(input)) {
    return;
  }

  const error = input.error as { message?: string | null; stack?: string | null; name?: string | null } | null;
  if (!error?.message) {
    return;
  }

  const request = (async () => {
    try {
      const distinctId = await getDistinctId();

      await fetch(`${config.host}/capture/`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          api_key: config.key,
          event: "$exception",
          properties: {
            distinct_id: distinctId,
            ...getExtensionRuntimeProperties(),
            ...buildPosthogExceptionProperties(input),
            $exception_message: error.message,
            $exception_stack_trace_raw: error.stack ?? null,
            $exception_type: error.name ?? "Unknown",
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

const PROFILE_CACHE_KEY = "relay.analyticsProfileCache";

async function fetchAndCacheProfile(apiBase: string, token: string, userId: string) {
  try {
    const response = await fetch(`${apiBase}/api/viewer`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { name?: string | null; email?: string | null };
    const profile = { name: data.name ?? null, email: data.email ?? null };
    await chrome.storage.local.set({ [PROFILE_CACHE_KEY]: { userId, ...profile } });
    return profile;
  } catch {
    return null;
  }
}

async function getCachedProfile(userId: string) {
  const stored = await chrome.storage.local.get(PROFILE_CACHE_KEY);
  const cached = stored[PROFILE_CACHE_KEY] as { userId?: string; name?: string | null; email?: string | null } | undefined;
  if (cached?.userId === userId) return { name: cached.name ?? null, email: cached.email ?? null };
  return null;
}

export async function identifyExtensionUser(userId: string | null | undefined) {
  if (!userId || typeof chrome === "undefined" || !chrome.storage?.local) {
    return;
  }

  const [anonymousDistinctId, stored] = await Promise.all([
    getAnonymousDistinctId(),
    chrome.storage.local.get([IDENTIFIED_USER_STORAGE_KEY]),
  ]);
  const previousUserId = stored[IDENTIFIED_USER_STORAGE_KEY];

  if (previousUserId === userId) {
    return;
  }

  const session = await getRelaySession();
  const profile =
    (await getCachedProfile(userId)) ??
    (session.token ? await fetchAndCacheProfile(session.apiBase, session.token, userId) : null);

  const $set: Record<string, string | boolean | null> = {
    platform: "extension",
    is_extension_installed: true,
  };
  if (profile?.name) $set.name = profile.name;
  if (profile?.email) $set.email = profile.email;

  await queueRawPosthogEvent({
    event: "$identify",
    distinctId: userId,
    properties: {
      $anon_distinct_id: anonymousDistinctId,
      identified_user_id: userId,
      platform: "extension",
    },
    $set,
  });

  await chrome.storage.local.set({
    [IDENTIFIED_USER_STORAGE_KEY]: userId,
  });
}

export function recordBackgroundTelemetry(input: TelemetryEventInput) {
  const event = sanitizeTelemetryEvent(input);
  writeConsoleEvent(event);
  if (event.level !== "debug") {
    queueBackgroundPosthog(event);
    queueBackgroundException(event);
  }
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
