import type {
  RelayOnboardingState,
  TelemetryEventInput,
} from "@relay/shared";

export interface RelayProjectOption {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  memoryCount?: number;
  sessionCount?: number;
  routingContext?: {
    hasMeaningfulContext: boolean;
    keywords: string[];
  } | null;
}

export type RelayRemoteStatus = "loading" | "ready" | "stale" | "unavailable";
export type RelayInsertKind = "fresh_chat_bootstrap" | "quick_continuity";
export type RelaySidebarViewState =
  | "connected-loading"
  | "connected-ready"
  | "connected-empty"
  | "disconnected"
  | "unsupported";

export interface RelayIssue {
  kind:
    | "network"
    | "digest"
    | "unsupported"
    | "missing_project"
    | "prompt"
    | "unknown";
  detail: string;
  recoverable: boolean;
}

export interface RelayTrustMetadata {
  updatedAt: string | null;
  updatedLabel: string | null;
  recentChatCount: number;
  savedContextCount: number;
}

export interface RelayContextPreviewItem {
  key: string;
  text: string;
  source: "manual" | "derived";
  memoryId?: string | null;
}

export interface RelayContextPreview {
  decisions: RelayContextPreviewItem[];
  constraints: RelayContextPreviewItem[];
  tasks: RelayContextPreviewItem[];
}

export interface RelayChatAssociation {
  status: "none" | "pending" | "saved" | "held" | "archived" | "ignored";
  projectId: string | null;
  projectName: string | null;
  sessionId: string | null;
  reason: string | null;
  capturedAt: string | null;
}

export interface RelayAssociationToastPayload {
  mode: "auto_save" | "held_review" | "confirmed" | "capture_result";
  projectId: string;
  projectName: string;
  projectOptions: RelayProjectOption[];
  sessionId?: string | null;
  expiresAt: number;
  digestStatus?: "analyzed" | "queued" | "saved" | null;
}

export interface RelayRoutingReview {
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
}

export type RelayAssociationTier = "none" | "high" | "medium" | "low";

export interface RelayAssociationToastState {
  visible: boolean;
  mode: "auto_save" | "held_review" | "confirmed" | "capture_result" | null;
  projectId: string | null;
  projectName: string | null;
  projectOptions: RelayProjectOption[];
  sessionId: string | null;
  expiresAt: number | null;
  paused: boolean;
  digestStatus?: "analyzed" | "queued" | "saved" | null;
}

export interface RelayInsertState {
  status: "idle" | "inserting" | "inserted" | "error";
  source: "sidebar" | "inline_chip" | "shortcut" | null;
  message: string | null;
  updatedAt: string | null;
}

export interface RelayActiveProjectState {
  projectId: string | null;
  projectName: string | null;
  projectOptions: RelayProjectOption[];
  viewState: RelaySidebarViewState;
  showCue: boolean;
  status: "ready" | "updating" | "unavailable";
  message: string;
  trustLine: string;
  freshnessText: string | null;
  shortcutLabel: string;
  canInsert: boolean;
  page: RelayPageState;
  trust: RelayTrustMetadata;
  remoteStatus: RelayRemoteStatus;
  issue: RelayIssue | null;
  insertKind: RelayInsertKind;
  lastSuccessfulSyncAt: string | null;
  capturePending: boolean;
  contextPreview: RelayContextPreview;
  chatAssociation: RelayChatAssociation;
  routingReview: RelayRoutingReview | null;
  associationTier: RelayAssociationTier;
  associationToast: RelayAssociationToastState;
  associationSuppressed: boolean;
  insertState: RelayInsertState;
  onboarding: RelayOnboardingState;
  lastReconciliation: { archivedCount: number; archivedItems: string[] } | null;
  lastBudgetStatus: { aiUsed: number; aiLimit: number; aiRemaining: number; plan: string } | null;
}

export type RelayMessage =
  | { type: "RELAY_PAGE_STATE" }
  | {
      type: "RELAY_EXTENSION_THEME_CHANGED";
      payload: { theme: "light" | "dark" | "system" };
    }
  | { type: "RELAY_PAGE_STATE_UPDATE"; payload: RelayPageState }
  | {
      type: "RELAY_SHOW_INLINE_CHIP";
      payload?: { insertKind?: RelayInsertKind };
    }
  | { type: "RELAY_SHORTCUT_ACTION" }
  | {
      type: "RELAY_ACTIVE_PROJECT_STATE_CHANGED";
      payload: { tabId: number; state: RelayActiveProjectState };
    }
  | { type: "RELAY_INSERT_CONTEXT"; payload: { content: string } }
  | {
      type: "RELAY_CAPTURE_VISIBLE";
      payload: { projectId: string; tabId?: number };
    }
  | { type: "RELAY_DISMISS_CAPTURE_REVIEW"; payload?: { tabId?: number } }
  | { type: "RELAY_TRIGGER_AUTO_CAPTURE"; payload: { tabId?: number } }
  | {
      type: "RELAY_PIN_SELECTION";
      payload: { projectId: string; tabId?: number };
    }
  | {
      type: "RELAY_GENERATE_BOOTSTRAP";
      payload: {
        projectId: string;
        targetProfileKey: string;
        kind: "quick_continuity" | "fresh_chat_bootstrap";
        deep?: boolean;
      };
    }
  | { type: "RELAY_GET_ACTIVE_PROJECT_STATE"; payload?: { tabId?: number } }
  | {
      type: "RELAY_INSERT_PROJECT_BRIEF";
      payload?: {
        projectId?: string;
        tabId?: number;
        source?: "sidebar" | "inline_chip" | "shortcut";
      };
    }
  | {
      type: "RELAY_SET_ACTIVE_PROJECT";
      payload: { projectId: string; tabId?: number };
    }
  | {
      type: "RELAY_SET_CHAT_ASSOCIATION_ARCHIVED";
      payload: {
        projectId: string;
        sessionId: string;
        archived: boolean;
        tabId?: number;
      };
    }
  | {
      type: "RELAY_RESOLVE_ASSOCIATION_TOAST";
      payload: {
        action: "approve" | "cancel";
        mode: "auto_save" | "held_review" | "confirmed";
        projectId: string;
        tabId?: number;
      };
    }
  | {
      type: "RELAY_SET_ASSOCIATION_TOAST_PAUSED";
      payload: {
        paused: boolean;
        mode: "auto_save" | "held_review" | "confirmed";
        projectId: string;
        tabId?: number;
      };
    }
  | {
      type: "RELAY_SET_CHAT_ASSOCIATION_PROJECT";
      payload: {
        projectId: string;
        tabId?: number;
        source?: "toast" | "inline_chip" | "sidebar";
      };
    }
  | { type: "RELAY_REFRESH_SESSION" }
  | { type: "RELAY_OPEN_SIDE_PANEL" }
  | { type: "RELAY_OPEN_DASHBOARD"; payload?: { nextPath?: string; flowId?: string } }
  | { type: "RELAY_GOOGLE_SIGN_IN"; payload: { deviceName: string; flowId?: string } }
  | {
      type: "RELAY_LOCAL_SIGN_IN";
      payload: { email: string; name?: string | null; deviceName: string; flowId?: string };
    }
  | {
      type: "RELAY_CREATE_PROJECT";
      payload: { name: string; slug?: string; description?: string | null; flowId?: string };
    }
  | {
      type: "RELAY_SHOW_ASSOCIATION_TOAST";
      payload: RelayAssociationToastPayload;
    }
  | {
      type: "RELAY_LOG_TELEMETRY";
      payload: TelemetryEventInput;
    };

export interface RelayPageState {
  supported: boolean;
  platform?: string;
  routeKind?: "fresh" | "chat" | "project_root" | "unknown";
  title?: string | null;
  url?: string;
  domain?: string;
  pathname?: string;
  pageFingerprint?: string | null;
  sourceConversationId?: string | null;
  turns?: number;
  captureSignature?: string;
  recentUserTurnText?: string | null;
  recentRoutingText?: string | null;
  fullVisibleRoutingText?: string | null;
  promptReady?: boolean;
  isFreshRoute?: boolean;
  isFreshChat?: boolean;
  isStable?: boolean;
  isStreaming?: boolean;
}
