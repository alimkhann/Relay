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

export const authGrace = { until: 0 };

// In-memory cache of persisted capture signatures, loaded from
// chrome.storage.session on worker wake (the load-time IIFE lives in index.ts).
// Consumed once per tab in getOrCreateTabState() to restore dedup state after
// MV3 service-worker suspension.
export const rehydratedSignatures: {
  current: Record<number, TabCaptureSignature> | null;
} = { current: null };
