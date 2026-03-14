"use client";

export type RelayThemeMode = "light" | "dark" | "system";

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

export function readStoredExtensionId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(EXTENSION_ID_STORAGE_KEY) ?? "";
}

export function rememberExtensionIdFromLocation(url = window.location.href) {
  if (typeof window === "undefined") return "";

  const parsed = new URL(url);
  const extensionId = parsed.searchParams.get("extensionId")?.trim() ?? "";
  if (extensionId) {
    window.localStorage.setItem(EXTENSION_ID_STORAGE_KEY, extensionId);
    return extensionId;
  }

  return readStoredExtensionId();
}

export async function syncThemeModeToExtension(theme: RelayThemeMode) {
  const extensionId = rememberExtensionIdFromLocation();
  const runtime = getBrowserRuntime();

  if (!extensionId || !runtime?.sendMessage) {
    return { ok: false, reason: "Extension bridge unavailable." as const };
  }

  return await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
    runtime.sendMessage?.(
      extensionId,
      {
        type: "RELAY_SYNC_THEME",
        payload: {
          theme,
        },
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
