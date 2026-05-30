import type {
  RelayOnboardingState,
  SourceSurface,
  SupportedPlatform,
  TelemetryEventInput,
  UserEntitlementsDto,
} from "@relay/shared";

export interface RelayProjectOption {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  projectUrl?: string | null;
  memoryCount?: number;
  sessionCount?: number;
  routingContext?: {
    hasMeaningfulContext: boolean;
    keywords: string[];
  } | null;
  /** 'personal' backs the user's personal memory; absent → normal project. */
  kind?: "project" | "personal";
  /** Per-project auto-capture override; undefined = inherit the global setting. */
  autoCapture?: boolean;
  /** Per-(platform) auto-capture override; wins over `autoCapture`. */
  autoCapturePlatforms?: Partial<Record<SupportedPlatform, boolean>>;
  /** Per-project inline-chip override; undefined = inherit the global setting. */
  inlineChip?: boolean;
  /** Per-(platform) inline-chip override; wins over `inlineChip`. */
  inlineChipPlatforms?: Partial<Record<SupportedPlatform, boolean>>;
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
  /** Capturing surface for manual items; null/undefined for derived. */
  sourceSurface?: SourceSurface | null;
  capturedAt?: string | null;
}

export interface RelayContextNoteItem {
  key: string;
  memoryId: string;
  text: string;
  sourceUrl: string | null;
  hostname: string | null;
  capturedAt: string;
}

export interface RelayContextPreview {
  decisions: RelayContextPreviewItem[];
  constraints: RelayContextPreviewItem[];
  tasks: RelayContextPreviewItem[];
  notes: RelayContextNoteItem[];
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
  mode: "saving" | "ask" | "done";
  projectId: string;
  projectName: string;
  projectOptions: RelayProjectOption[];
  sessionId?: string | null;
  expiresAt: number;
  digestStatus?: "analyzed" | "queued" | null;
  reason?: string | null;
}

export interface RelayRoutingReview {
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
}

export type RelayAssociationTier = "none" | "high" | "medium" | "low";

export interface RelayAssociationToastState {
  visible: boolean;
  mode: "saving" | "ask" | "done" | null;
  projectId: string | null;
  projectName: string | null;
  projectOptions: RelayProjectOption[];
  sessionId: string | null;
  expiresAt: number | null;
  digestStatus?: "analyzed" | "queued" | null;
  reason?: string | null;
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
  entitlements: UserEntitlementsDto | null;
}

export type RelayMessage =
  | { type: "RELAY_PAGE_STATE" }
  | {
      type: "RELAY_EXTENSION_THEME_CHANGED";
      payload: { theme: "light" | "dark" | "system" };
    }
  | {
      type: "RELAY_EXTENSION_USER_SETTINGS_CHANGED";
      payload: { settings: Record<string, unknown> };
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
        mode: "saving" | "ask";
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
  | { type: "RELAY_SIGN_OUT" }
  | { type: "RELAY_OPEN_SIDE_PANEL" }
  | { type: "RELAY_OPEN_DASHBOARD"; payload?: { nextPath?: string; flowId?: string } }
  | { type: "RELAY_GOOGLE_SIGN_IN"; payload: { deviceName: string; flowId?: string } }
  | {
      type: "RELAY_LOCAL_SIGN_IN";
      payload: { email: string; name?: string | null; deviceName: string; flowId?: string };
    }
  | {
      type: "RELAY_EMAIL_SIGN_IN";
      payload: {
        email: string;
        password: string;
        name?: string | null;
        intent?: "sign-in" | "sign-up";
        otp?: string | null;
        resendOnly?: boolean;
        deviceName: string;
        flowId?: string;
      };
    }
  | {
      type: "RELAY_CREATE_PROJECT";
      payload: { name: string; slug?: string; description?: string | null; projectUrl?: string | null; flowId?: string };
    }
  | {
      type: "RELAY_UPDATE_PROJECT";
      payload: { projectId: string; name: string; description?: string | null; projectUrl?: string | null; flowId?: string };
    }
  | {
      type: "RELAY_DELETE_PROJECT";
      payload: { projectId: string; flowId?: string };
    }
  | {
      type: "RELAY_SCAN_PROJECT_URL";
      payload: { url: string; flowId?: string };
    }
  | {
      type: "RELAY_SHOW_ASSOCIATION_TOAST";
      payload: RelayAssociationToastPayload;
    }
  | {
      type: "RELAY_LOG_TELEMETRY";
      payload: TelemetryEventInput;
    }
  | {
      type: "RELAY_PROJECT_MEMORY_UPDATED";
      payload: { projectId: string };
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
