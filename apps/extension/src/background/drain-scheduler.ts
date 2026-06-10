import { relayFetch } from "../utils/api";

// ── Drain scheduler ──────────────────────────────────────────────
// When a capture returns digestStrategy === "deferred", we schedule
// a drain call after DRAIN_DELAY_MS to batch-process deferred jobs.
const DRAIN_DELAY_MS = 5 * 60 * 1000; // 5 minutes
export const RETRY_DRAIN_DELAY_MS = 15_000;
const DRAIN_QUEUE_KEY = "relay.drain.pendingProjects";
const pendingDrainProjects = new Set<string>();
let drainTimerId: ReturnType<typeof setTimeout> | null = null;
let drainInFlight = false;
let scheduledDrainDelayMs: number | null = null;

async function persistDrainQueue() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.set({
      [DRAIN_QUEUE_KEY]: [...pendingDrainProjects],
    });
  } catch {
    // Non-fatal — in-memory queue still works for the current worker lifetime.
  }
}

async function restoreDrainQueue() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  try {
    const stored = await chrome.storage.local.get(DRAIN_QUEUE_KEY);
    const projects = stored[DRAIN_QUEUE_KEY];
    if (!Array.isArray(projects)) return;
    for (const projectId of projects) {
      if (typeof projectId === "string" && projectId.length > 0) {
        pendingDrainProjects.add(projectId);
      }
    }
    if (pendingDrainProjects.size > 0 && drainTimerId === null && !drainInFlight) {
      scheduleDrain([...pendingDrainProjects][0]!, RETRY_DRAIN_DELAY_MS);
    }
  } catch {
    // Ignore restore failures; network drains can be re-scheduled on next capture.
  }
}

void restoreDrainQueue();

export function scheduleDrain(projectId: string, delayMs = DRAIN_DELAY_MS) {
  pendingDrainProjects.add(projectId);
  void persistDrainQueue();
  if (drainInFlight) return;

  if (drainTimerId !== null) {
    if (scheduledDrainDelayMs !== null && scheduledDrainDelayMs <= delayMs) {
      return;
    }

    clearTimeout(drainTimerId);
    drainTimerId = null;
  }

  scheduledDrainDelayMs = delayMs;
  drainTimerId = setTimeout(async () => {
    drainTimerId = null;
    scheduledDrainDelayMs = null;
    drainInFlight = true;
    try {
      const projects = [...pendingDrainProjects];
      pendingDrainProjects.clear();
      void persistDrainQueue();
      for (const pid of projects) {
        try {
          const response = await relayFetch(`/api/projects/${pid}/drain`, { method: "POST" });
          if (!response.ok) {
            throw new Error(`Drain failed with status ${response.status}`);
          }
        } catch {
          pendingDrainProjects.add(pid);
          void persistDrainQueue();
          scheduleDrain(pid, RETRY_DRAIN_DELAY_MS);
        }
      }
    } finally {
      drainInFlight = false;
      if (pendingDrainProjects.size > 0) {
        const next = [...pendingDrainProjects];
        pendingDrainProjects.clear();
        void persistDrainQueue();
        for (const pid of next) scheduleDrain(pid, DRAIN_DELAY_MS);
      }
    }
  }, delayMs);
}