import { relayFetch } from "../utils/api";

// ── Drain scheduler ──────────────────────────────────────────────
// When a capture returns digestStrategy === "deferred", we schedule
// a drain call after DRAIN_DELAY_MS to batch-process deferred jobs.
const DRAIN_DELAY_MS = 5 * 60 * 1000; // 5 minutes
export const RETRY_DRAIN_DELAY_MS = 15_000;
const pendingDrainProjects = new Set<string>();
let drainTimerId: ReturnType<typeof setTimeout> | null = null;
let drainInFlight = false;
let scheduledDrainDelayMs: number | null = null;

export function scheduleDrain(projectId: string, delayMs = DRAIN_DELAY_MS) {
  pendingDrainProjects.add(projectId);
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
      for (const pid of projects) {
        try {
          await relayFetch(`/api/projects/${pid}/drain`, { method: "POST" });
        } catch { /* non-fatal */ }
      }
    } finally {
      drainInFlight = false;
      // If more deferred captures arrived during drain, restart timer
      if (pendingDrainProjects.size > 0) {
        const next = [...pendingDrainProjects];
        pendingDrainProjects.clear();
        for (const pid of next) scheduleDrain(pid, DRAIN_DELAY_MS);
      }
    }
  }, delayMs);
}
