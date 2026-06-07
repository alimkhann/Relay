import type {
  ProjectDashboardDto,
  ProjectStateStatusDto,
  RelayOnboardingState,
} from "@relay/shared";

import type {
  RelayAssociationToastState,
  RelayChatAssociation,
  RelayContextPreview,
  RelayInsertState,
  RelayPageState,
  RelayProjectOption,
  RelayRemoteStatus,
  RelayRoutingReview,
  RelayTrustMetadata,
} from "../messaging/contracts";
import type { RelayBoundProjectSignal } from "./routing";

export interface RemoteSettingsPayload {
  settings: {
    autoCapture: boolean;
    defaultTargetProfileKey: string;
    showSidepanelOnSupportedSites?: boolean;
    autoCapturePrompt?: {
      eligible: boolean;
      dismissedAt: string | null;
      activatedAt: string | null;
    };
  };
}

export interface RemoteSettingsResponsePayload {
  settings: { settings: RemoteSettingsPayload["settings"] };
  onboarding?: RelayOnboardingState;
}

export interface ExtensionAuthSessionPayload {
  token: string;
  apiBase: string;
  userId?: string;
  projectId: string;
  projects?: RelayProjectOption[];
  onboarding?: RelayOnboardingState;
  settings?: { settings?: Partial<RemoteSettingsPayload["settings"]> };
}

export type ProjectDashboardPayload = ProjectDashboardDto;

export interface RelayTabState {
  tabId: number;
  page: RelayPageState;
  projectId: string | null;
  projectName: string | null;
  projectOptions: RelayProjectOption[];
  trust: RelayTrustMetadata;
  stateStatus: ProjectStateStatusDto | null;
  contextPreview: RelayContextPreview;
  chatAssociation: RelayChatAssociation;
  routingReview: RelayRoutingReview | null;
  boundProject: RelayBoundProjectSignal | null;
  showCue: boolean;
  remoteStatus: RelayRemoteStatus;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  retryDelayMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  syncInFlight: boolean;
  syncQueued: boolean;
  syncRequestKey: string | null;
  lastSyncedRequestKey: string | null;
  capturePending: boolean;
  capturePendingAt: number | null;
  captureTimer: ReturnType<typeof setTimeout> | null;
  associationToast: RelayAssociationToastState;
  associationToastTimer: ReturnType<typeof setTimeout> | null;
  associationSuppressed: boolean;
  // Manual "switch to project" override. Wins over the chat's auto-derived
  // association for the active/picker project AND the next save, and survives
  // re-syncs of the same chat. Cleared when the user navigates to a different
  // conversation (chat key change) or retargets the chat association.
  manualProjectId: string | null;
  manualProjectChatKey: string | null;
  insertState: RelayInsertState;
  insertStateTimer: ReturnType<typeof setTimeout> | null;
  pendingInsertedBrief: PendingInsertedBriefState | null;
  lastObservedSignature: string | null;
  lastObservedTurns: number;
  lastCapturedSignature: string | null;
  lastCapturedTurns: number;
  lastRoutedSignature: string | null;
  lastReconciliation: { archivedCount: number; archivedItems: string[] } | null;
  lastBudgetStatus: { aiUsed: number; aiLimit: number; aiRemaining: number; plan: string } | null;
}

export interface PendingInsertedBriefState {
  projectId: string;
  projectName: string;
  packetId: string | null;
  insertKind: "fresh_chat_bootstrap" | "quick_continuity";
  chatKey: string | null;
  insertedAtSignature: string | null;
  insertedContent: string;
  insertedContentHash: string;
  matchSnippet: string;
  matchSnippets: string[];
  expiresAt: number;
}
