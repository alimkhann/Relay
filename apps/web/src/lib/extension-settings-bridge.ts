"use client";

import type { UserSettingsRow } from "@relay/shared";

const EXTENSION_ID_STORAGE_KEY = "relay-extension-id";

type RuntimeBridge = {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback?: (response?: { ok?: boolean; reason?: string }) => void,
  ) => void;
  lastError?: {
    message?: string;
  };
};

function getBrowserRuntime(): RuntimeBridge | null {
  return typeof window === "undefined"
    ? null
    : ((window as Window & { chrome?: { runtime?: RuntimeBridge } }).chrome
        ?.runtime ?? null);
}

function readStoredExtensionId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(EXTENSION_ID_STORAGE_KEY) ?? "";
}

export async function syncUserSettingsToExtension(
  settings: UserSettingsRow["settings"],
) {
  const extensionId = readStoredExtensionId();
  const runtime = getBrowserRuntime();

  if (!extensionId || !runtime?.sendMessage) {
    return { ok: false, reason: "Extension bridge unavailable." as const };
  }

  return await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
    runtime.sendMessage?.(
      extensionId,
      {
        type: "RELAY_SYNC_USER_SETTINGS",
        payload: { settings },
      },
      (response?: { ok?: boolean; reason?: string }) => {
        const runtimeError = runtime.lastError?.message;
        if (runtimeError) {
          resolve({ ok: false, reason: runtimeError });
          return;
        }
        resolve({
          ok: Boolean(response?.ok),
          reason: response?.reason,
        });
      },
    );
  });
}
