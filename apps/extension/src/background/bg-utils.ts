import type { RelayOnboardingState } from "@relay/shared";

import type { RelayMessage } from "../messaging/contracts";

export const CAPTURE_TAB_MESSAGE_TIMEOUT_MS = 8_000;
export const AUTO_CAPTURE_GRACE_MS = 400;
export const CAPTURE_API_TIMEOUT_MS = 70_000;

export const REMOTE_RETRY_DELAY_MS = 300;
// Exponential backoff schedule between retry attempts (3x growth).
// 4 attempts total: initial + 3 retries at 300ms, 900ms, 2700ms.
export const REMOTE_RETRY_BACKOFF_MS = [300, 900, 2_700];
export const REMOTE_RETRY_MAX_ATTEMPTS = 4;

export function formatUpdatedLabel(value: string | null | undefined) {
  if (!value) return null;

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes <= 1) return "a moment ago";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTabMessageWithTimeout<T>(
  tabId: number,
  message: RelayMessage,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return await Promise.race([
    chrome.tabs.sendMessage(tabId, message) as Promise<T>,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]);
}

export function createPendingOnboardingState(): RelayOnboardingState {
  return {
    status: "pending",
    completedProjectId: null,
    completedVia: null,
    completedAt: null,
  };
}

export function isAuthFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("authentication is required") ||
    normalized.includes("account not found") ||
    normalized.includes("user not found") ||
    normalized.includes("deleted account") ||
    normalized.includes("invalid session")
  );
}

export async function readErrorResponse(response: Response, fallback: string) {
  try {
    const text = await response.text();

    if (!text.trim()) {
      return `${fallback} (HTTP ${response.status})`;
    }

    try {
      const payload = JSON.parse(text) as {
        error?: string;
        message?: string;
      };
      return payload.error ?? payload.message ?? `${fallback} (HTTP ${response.status})`;
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
      return snippet
        ? `${fallback} (HTTP ${response.status}): ${snippet}`
        : `${fallback} (HTTP ${response.status})`;
    }
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

export async function retryRemote<T>(
  task: () => Promise<T>,
  attempts = REMOTE_RETRY_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task();
    } catch (cause) {
      lastError = cause;
      if (index < attempts - 1) {
        const delay =
          REMOTE_RETRY_BACKOFF_MS[index] ??
          REMOTE_RETRY_BACKOFF_MS[REMOTE_RETRY_BACKOFF_MS.length - 1] ??
          REMOTE_RETRY_DELAY_MS;
        await wait(delay);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Relay remote request failed.");
}
