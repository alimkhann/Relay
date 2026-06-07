import type { RelayOnboardingState, UserEntitlementsDto } from "@relay/shared";

import type { RelayProjectOption } from "../messaging/contracts";
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
