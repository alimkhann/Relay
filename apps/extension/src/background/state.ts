import type { RelayOnboardingState, UserEntitlementsDto } from "@relay/shared";

import type { RelayProjectOption } from "../messaging/contracts";
import type { TabCaptureSignature } from "../storage/capture-signatures";
import type {
  ProjectDashboardPayload,
  RelayTabState,
  RemoteSettingsPayload,
} from "./bg-types";

// ── Background service-worker singletons ─────────────────────────
// Side-effect-free shared state. Both index.ts (the entrypoint, which owns
// the chrome.* listeners) and extracted modules import from here, never the
// other way around — this is the bottom of the dependency DAG, so it cannot
// introduce a cycle through index.ts's listener side-effects.

export const tabStates = new Map<number, RelayTabState>();

export const dashboardCache = new Map<
  string,
  { dashboard: ProjectDashboardPayload | null; fetchedAt: number }
>();

/** Next fetch for these projects must hit the network (skip persisted SWR). */
export const dashboardCacheBypass = new Set<string>();

export interface SessionCacheEntry {
  token: string;
  data: {
    connected: boolean;
    projects: RelayProjectOption[];
    settings: RemoteSettingsPayload | null;
    onboarding: RelayOnboardingState;
    entitlements: UserEntitlementsDto | null;
  };
  fetchedAt: number;
}

// `let`-style mutable cells wrapped in holders so importers see live updates
// (a bare `export let` gives importers a read-only binding).
export const sessionCache: { current: SessionCacheEntry | null } = { current: null };

// Guards the session refresh against runaway loops. A failing refresh used to
// spin ~5×/sec: the trigger path calls loadSessionData with force:true (which
// bypasses the TTL cache), and nothing coalesced concurrent calls or backed off
// after repeated failures, so a persistently-failing API (e.g. the 0.6.0
// localhost build) produced hundreds of `session.refresh_failed` events/min.
//   - inFlight: dedup concurrent refreshes onto one promise.
//   - cooldownUntil: after a failure, skip the network (even when force=true)
//     until this timestamp; serve cache instead.
//   - failureStreak: index into the cooldown backoff schedule.
//   - lastFailureLogAt: throttles the failure telemetry emit.
export const sessionRefresh: {
  inFlight: Promise<SessionCacheEntry["data"]> | null;
  cooldownUntil: number;
  failureStreak: number;
  lastFailureLogAt: number;
} = { inFlight: null, cooldownUntil: 0, failureStreak: 0, lastFailureLogAt: 0 };

// Clear the refresh guards on any session change (sign-in/out/reset). Otherwise a
// cooldown left over from a failure storm would keep a freshly re-authenticated
// session from refreshing for up to the backoff cap, and a stale in-flight
// promise from the previous token could resolve into the new session.
export function resetSessionRefreshGuards() {
  sessionRefresh.inFlight = null;
  sessionRefresh.cooldownUntil = 0;
  sessionRefresh.failureStreak = 0;
  sessionRefresh.lastFailureLogAt = 0;
}

export const authGrace = { until: 0 };

// In-memory cache of persisted capture signatures, loaded from
// chrome.storage.session on worker wake (the load-time IIFE lives in index.ts).
// Consumed once per tab in getOrCreateTabState() to restore dedup state after
// MV3 service-worker suspension.
export const rehydratedSignatures: {
  current: Record<number, TabCaptureSignature> | null;
} = { current: null };
