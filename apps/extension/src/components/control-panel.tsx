import { useEffect, useRef, useState } from "react";

// ── OTP cell component ──────────────────────────────────────────────────────

interface OtpCellsProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

function OtpCells({ value, onChange, disabled }: OtpCellsProps) {
  const [cells, setCells] = useState<string[]>(() => {
    const arr = value.split("").slice(0, 6);
    while (arr.length < 6) arr.push("");
    return arr;
  });
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const arr = value.split("").slice(0, 6);
    while (arr.length < 6) arr.push("");
    setCells(arr);
  }, [value]);

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...cells];
    next[index] = digit;
    setCells(next);
    onChange(next.join(""));
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !cells[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...cells];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] ?? "";
    }
    setCells(next);
    onChange(next.join(""));
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  }

  return (
    <div className={styles.otpCells}>
      {cells.map((cell, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          value={cell}
          disabled={disabled}
          className={styles.otpCell}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}

import { slugify } from "@relay/shared/utils/text";
import { supportedPlatforms } from "@relay/shared/constants/platforms";
import type { SupportedPlatform, UserSettingsRow } from "@relay/shared/types/database";

import type { RelayActiveProjectState, RelayProjectOption } from "../messaging/contracts";
import { getActiveTab } from "../utils/browser";
import { relayFetch } from "../utils/api";
import {
  getRelaySession,
  setRelaySession,
  type RelaySessionState,
} from "../storage/session";
import {
  getRelayThemeMode,
  resolveRelayThemeMode,
  type RelayResolvedTheme,
  type RelayThemeMode,
} from "../storage/theme";
import {
  deriveAssociationCardPresentation,
  deriveUnresolvedAssociationCardPresentation,
  shouldShowAssociationCard,
} from "./control-panel-state";
import { resolveDisplayedPlan } from "./control-panel-billing";
import {
  createExtensionFlowId,
  logExtensionEvent,
} from "../utils/telemetry";
import relayIconUrl from "../../assets/icon.png";
import { PlatformIcon, prettyPlatformName } from "./platform-icon";
import { WalkthroughModal } from "./walkthrough-modal";
import styles from "./control-panel.module.css";

interface ControlPanelProps {
  compact?: boolean;
}

type ContextSection = "decisions" | "constraints" | "tasks";
type ContextTab = "all" | ContextSection;
type ContextItem = RelayActiveProjectState["contextPreview"][ContextSection][number];

const sectionColorClass: Record<ContextSection, string> = {
  decisions: "contextSectionDecisions",
  constraints: "contextSectionConstraints",
  tasks: "contextSectionTasks",
};

const sectionLabels: Record<ContextSection, string> = {
  decisions: "Decisions",
  constraints: "Constraints",
  tasks: "Tasks",
};

const memoryTypeBySection = {
  decisions: "decision",
  constraints: "constraint",
  tasks: "task",
} as const;

const hiddenFieldBySection = {
  decisions: "hiddenDecisions",
  constraints: "hiddenConstraints",
  tasks: "hiddenOpenTasks",
} as const;

const BILLING_UPGRADE_URL = "https://www.onrelay.app/settings?section=billing";

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

function defaultDeviceName() {
  const platform = navigator.userAgent.includes("Mac")
    ? "Mac"
    : navigator.platform || "browser";
  return `Relay on ${platform}`;
}

const extensionAuthProvider =
  process.env.PLASMO_PUBLIC_RELAY_AUTH_PROVIDER === "local"
    ? "local"
    : "neon";

const emptyActiveState: RelayActiveProjectState = {
  projectId: null,
  projectName: null,
  projectOptions: [],
  viewState: "unsupported",
  showCue: true,
  status: "unavailable",
  message: "Open a supported AI chat to use Relay.",
  trustLine: "Built from recent chats and saved project context",
  freshnessText: null,
  shortcutLabel: navigator.userAgent.includes("Mac") ? "⌘⇧I" : "Ctrl+Shift+I",
  canInsert: false,
  page: { supported: false },
  trust: {
    updatedAt: null,
    updatedLabel: null,
    recentChatCount: 0,
    savedContextCount: 0,
  },
  remoteStatus: "unavailable",
  issue: null,
  insertKind: "fresh_chat_bootstrap",
  lastSuccessfulSyncAt: null,
  capturePending: false,
  contextPreview: {
    decisions: [],
    constraints: [],
    tasks: [],
    notes: [],
  },
  chatAssociation: {
    status: "none",
    projectId: null,
    projectName: null,
    sessionId: null,
    reason: null,
    capturedAt: null,
  },
  routingReview: null,
  associationTier: "none",
  associationToast: {
    visible: false,
    mode: null,
    projectId: null,
    projectName: null,
    projectOptions: [],
    sessionId: null,
    expiresAt: null,
    digestStatus: null,
    reason: null,
  },
  associationSuppressed: false,
  insertState: {
    status: "idle",
    source: null,
    message: null,
    updatedAt: null,
  },
  onboarding: {
    status: "pending",
    completedProjectId: null,
    completedVia: null,
    completedAt: null,
  },
  lastReconciliation: null,
  lastBudgetStatus: null,
  entitlements: null,
};

function isRelayActiveProjectState(
  value: unknown,
): value is RelayActiveProjectState {
  return Boolean(
    value &&
    typeof value === "object" &&
    "page" in value &&
    typeof (value as RelayActiveProjectState).page?.supported === "boolean" &&
    Array.isArray((value as RelayActiveProjectState).projectOptions),
  );
}

function deriveInsertButtonState(activeState: RelayActiveProjectState) {
  const insertState = activeState.insertState;

  if (insertState.status === "inserting") {
    return {
      label: "Inserting…",
      shimmering: true,
      disabled: true,
    };
  }

  if (insertState.status === "inserted") {
    return {
      label: "Inserted",
      shimmering: false,
      disabled: false,
    };
  }

  if (insertState.status === "error") {
    return {
      label: insertState.message ?? "Insert project brief",
      shimmering: false,
      disabled: !activeState.canInsert,
    };
  }

  return {
    label: "Insert project brief",
    shimmering: false,
    disabled: !activeState.canInsert,
  };
}

export function ControlPanel({ compact = false }: ControlPanelProps) {
  const [session, setSession] = useState<RelaySessionState | null>(null);
  const [activeState, setActiveState] =
    useState<RelayActiveProjectState>(emptyActiveState);
  const activeStateRef = useRef<RelayActiveProjectState>(emptyActiveState);
  useEffect(() => {
    activeStateRef.current = activeState;
  }, [activeState]);
  const [status, setStatus] = useState("Relay stays quiet until it is useful.");
  const [busy, setBusy] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [switcherMode, setSwitcherMode] = useState<"list" | "create" | "edit">("list");
  const [switcherEditTarget, setSwitcherEditTarget] = useState<RelayProjectOption | null>(null);
  const [switcherEditName, setSwitcherEditName] = useState("");
  const [switcherEditDescription, setSwitcherEditDescription] = useState("");
  const [switcherEditUrl, setSwitcherEditUrl] = useState("");
  const [switcherEditScanPending, setSwitcherEditScanPending] = useState(false);
  const [deletingProject, setDeletingProject] = useState<RelayProjectOption | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [associationAction, setAssociationAction] = useState<
    null | "approving_held"
  >(null);
  const [projectScanPending, setProjectScanPending] = useState(false);
  const [newProjectUrl, setNewProjectUrl] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [localAuthEmail, setLocalAuthEmail] = useState("");
  const [localAuthName, setLocalAuthName] = useState("");
  const [emailAuthEmail, setEmailAuthEmail] = useState("");
  const [emailAuthPassword, setEmailAuthPassword] = useState("");
  const [emailAuthName, setEmailAuthName] = useState("");
  const [emailAuthOtp, setEmailAuthOtp] = useState("");
  const [emailAuthAwaitingOtp, setEmailAuthAwaitingOtp] = useState(false);
  const [emailAuthResendSeconds, setEmailAuthResendSeconds] = useState(0);
  const [emailAuthMode, setEmailAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [activeContextTab, setActiveContextTab] = useState<ContextTab>("all");
  const [expandedSections, setExpandedSections] = useState<
    Record<ContextSection, boolean>
  >({
    decisions: false,
    constraints: false,
    tasks: false,
  });
  const [drafts, setDrafts] = useState<Record<ContextSection, string>>({
    decisions: "",
    constraints: "",
    tasks: "",
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [themeMode, setThemeMode] = useState<RelayThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] =
    useState<RelayResolvedTheme>("dark");
  const [panelMode, setPanelMode] = useState<"main" | "settings">("main");
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettingsRow["settings"] | null>(null);
  const [userSettingsBusy, setUserSettingsBusy] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const walkthroughChecked = useRef(false);
  const activeStateRequestInFlight = useRef(false);

  useEffect(() => {
    if (!emailAuthAwaitingOtp || emailAuthResendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setEmailAuthResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [emailAuthAwaitingOtp, emailAuthResendSeconds]);

  function applyResolvedTheme(nextResolvedTheme: RelayResolvedTheme) {
    document.documentElement.dataset.relayTheme = nextResolvedTheme;
    document.body.dataset.relayTheme = nextResolvedTheme;
    setResolvedTheme(nextResolvedTheme);
  }

  useEffect(() => {
    void (async () => {
      const flowId = createExtensionFlowId("ext-open");
      logExtensionEvent({
        level: "info",
        surface: "extension-sidebar",
        area: "lifecycle",
        event: "extension_opened",
        flowId,
        message: "Opened the Relay extension UI.",
        context: {
          targetSurface: compact ? "popup" : "sidepanel",
        },
      });
      logExtensionEvent({
        level: "info",
        surface: "extension-sidebar",
        area: "session",
        event: "session_started",
        flowId,
        message: "Started an extension UI session.",
        context: {
          targetSurface: compact ? "popup" : "sidepanel",
        },
      });
      setDeviceName(defaultDeviceName());
      const nextThemeMode = await getRelayThemeMode();
      setThemeMode(nextThemeMode);
      applyResolvedTheme(resolveRelayThemeMode(nextThemeMode));
      await refreshLocalSession();
      await refreshActiveProjectState();
    })();
  }, [compact]);

  useEffect(() => {
    if (panelMode === "settings" && session?.connected && !userSettings) {
      void loadUserSettings();
    }
  }, [panelMode, session?.connected]);

  useEffect(() => {
    if (session?.connected && !walkthroughChecked.current) {
      void loadUserSettings();
    }
  }, [session?.connected]);

  useEffect(() => {
    if (!session?.connected) return;
    const onFocus = () => {
      void loadUserSettings();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [session?.connected]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (themeMode === "system") {
        applyResolvedTheme(resolveRelayThemeMode("system"));
      }
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [themeMode]);

  const shouldShowAutoCapturePrompt =
    !!session?.connected &&
    session.onboarding.status === "completed" &&
    session.autoCapturePrompt.eligible &&
    !session.autoCapturePrompt.dismissedAt &&
    !session.autoCapturePrompt.activatedAt &&
    !session.autoCapture;

  useEffect(() => {
    const handleTabActivated = () => {
      void refreshActiveProjectState();
    };

    const handleTabUpdated = (
      _tabId: number,
      changeInfo: { status?: string },
      tab: { active?: boolean },
    ) => {
      if (changeInfo.status === "complete" && tab.active) {
        void refreshActiveProjectState();
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, []);

  useEffect(() => {
    const handleRuntimeMessage = (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "RELAY_EXTENSION_THEME_CHANGED" &&
        "payload" in message &&
        message.payload &&
        typeof message.payload === "object" &&
        "theme" in message.payload
      ) {
        const nextTheme =
          message.payload.theme === "light" ||
          message.payload.theme === "dark" ||
          message.payload.theme === "system"
            ? message.payload.theme
            : "system";
        setThemeMode(nextTheme);
        applyResolvedTheme(resolveRelayThemeMode(nextTheme));
        return;
      }

      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "RELAY_PROJECT_MEMORY_UPDATED" &&
        "payload" in message &&
        message.payload &&
        typeof message.payload === "object" &&
        "projectId" in message.payload
      ) {
        const updatedProjectId = (message.payload as { projectId?: string }).projectId;
        if (
          updatedProjectId &&
          updatedProjectId === activeStateRef.current?.projectId
        ) {
          void refreshActiveProjectState();
        }
        return;
      }

      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "RELAY_EXTENSION_USER_SETTINGS_CHANGED" &&
        "payload" in message &&
        message.payload &&
        typeof message.payload === "object" &&
        "settings" in message.payload
      ) {
        const nextSettings = (
          message.payload as { settings?: UserSettingsRow["settings"] }
        ).settings;
        if (nextSettings && typeof nextSettings === "object") {
          setUserSettings(nextSettings);
        }
        return;
      }

      const payload =
        message &&
        typeof message === "object" &&
        "payload" in message &&
        typeof message.payload === "object" &&
        message.payload
          ? (message.payload as {
              tabId?: number;
              state?: RelayActiveProjectState;
            })
          : null;

      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "RELAY_ACTIVE_PROJECT_STATE_CHANGED" ||
        !payload
      ) {
        return;
      }

      void (async () => {
        const tab = await getActiveTab();
        if (
          !tab?.id ||
          payload.tabId !== tab.id ||
          !isRelayActiveProjectState(payload.state)
        ) {
          return;
        }

        applyActiveState(payload.state);
      })();
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, []);

  useEffect(() => {
    function handleError(event: ErrorEvent) {
      logExtensionEvent({
        level: "error",
        surface: "extension-sidebar",
        area: "runtime",
        event: "sidebar.error",
        message: event.message || "Unhandled extension UI error.",
        error: event.error ?? event.message,
      });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      logExtensionEvent({
        level: "error",
        surface: "extension-sidebar",
        area: "runtime",
        event: "sidebar.unhandled_rejection",
        message: "Unhandled extension UI promise rejection.",
        error: event.reason,
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  function applyActiveState(nextState: RelayActiveProjectState) {
    setActiveState(nextState);
    setSession((current) =>
      current
        ? {
            ...current,
            projectId: nextState.projectId ?? current.projectId,
            assumedProjectId: nextState.projectId ?? "",
            assumedProjectName: nextState.projectName ?? "",
            trust: nextState.trust,
            projectOptions: nextState.projectOptions,
            onboarding: nextState.onboarding,
          }
        : current,
    );
  }

  async function refreshLocalSession() {
    const nextSession = await getRelaySession();
    setSession(nextSession);
    if (nextSession.lastStatus) {
      setStatus(nextSession.lastStatus);
    }
  }

  async function loadUserSettings() {
    if (userSettingsBusy) return;
    try {
      const response = await relayFetch("/api/settings");
      if (!response.ok) return;
      const data = (await response.json()) as {
        settings?: UserSettingsRow["settings"]
        onboarding?: { completedVia: string | null }
      };
      if (!data.settings || typeof data.settings !== "object") return;
      if (userSettingsBusy) return;
      setUserSettings(data.settings);
      if (!walkthroughChecked.current) {
        walkthroughChecked.current = true;
        const completedVia = data.onboarding?.completedVia ?? null;
        if (!data.settings.walkthrough?.dismissedAt && completedVia !== "web") {
          setShowWalkthrough(true);
        }
      }
    } catch {
      // Best-effort; settings view falls back to defaults.
    }
  }

  async function patchUserSettings(patch: Partial<UserSettingsRow["settings"]>) {
    if (userSettingsBusy) return;
    const previous = userSettings;
    setUserSettings((current) => (current ? { ...current, ...patch } : current));
    setUserSettingsBusy(true);
    try {
      const response = await relayFetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setUserSettings(previous);
        setStatus(await readErrorMessage(response, "Could not save settings."));
        return;
      }
      const data = (await response.json()) as { settings?: UserSettingsRow["settings"] };
      if (data.settings) setUserSettings(data.settings);
      if (patch.autoCapture !== undefined) {
        logExtensionEvent({
          level: "info",
          surface: "extension-sidebar",
          area: "settings",
          event: "auto_capture_toggled",
          message: patch.autoCapture ? "Enabled auto-capture." : "Disabled auto-capture.",
          context: {
            enabled: patch.autoCapture,
            source: "settings",
          },
        });
        await setRelaySession({ autoCapture: patch.autoCapture });
        await refreshLocalSession();
      }
    } catch (cause) {
      setUserSettings(previous);
      setStatus(cause instanceof Error ? cause.message : "Could not save settings.");
    } finally {
      setUserSettingsBusy(false);
    }
  }

  async function togglePlatformEnabled(platform: SupportedPlatform, enabled: boolean) {
    const current = userSettings?.enabledPlatforms ?? [...supportedPlatforms];
    const next = enabled
      ? Array.from(new Set([...current, platform]))
      : current.filter((p) => p !== platform);
    await patchUserSettings({ enabledPlatforms: next });
  }

  async function changeThemeMode(nextMode: RelayThemeMode) {
    setThemeMode(nextMode);
    applyResolvedTheme(resolveRelayThemeMode(nextMode));
    try {
      const { setRelayThemeMode } = await import("../storage/theme");
      await setRelayThemeMode(nextMode);
    } catch {
      // Storage write best-effort; UI already updated.
    }
  }

  async function handleSignOut() {
    if (signOutBusy) return;
    const confirmed = window.confirm("Sign out of Relay?");
    if (!confirmed) return;

    setSignOutBusy(true);
    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_SIGN_OUT",
      })) as { ok?: boolean; reason?: string };

      if (!result?.ok) {
        setStatus(result?.reason ?? "Sign out failed.");
        setSignOutBusy(false);
        return;
      }

      setPanelMode("main");
      await refreshLocalSession();
      await refreshActiveProjectState();
      setStatus("Signed out.");
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Sign out failed.",
      );
    } finally {
      setSignOutBusy(false);
    }
  }

  async function refreshRemoteSession() {
    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_REFRESH_SESSION",
      })) as {
        ok?: boolean;
        error?: string;
      };

      if (result?.error) {
        setStatus(result.error);
        return;
      }

      await refreshLocalSession();
      await refreshActiveProjectState();
      setStatus("Relay is connected and ready.");
    } catch (cause) {
      setStatus(
        cause instanceof Error
          ? cause.message
          : "Failed to refresh Relay session.",
      );
    }
  }

  async function updateAutoCapturePrompt(action: "activate" | "dismiss") {
    if (!session) {
      return;
    }

    setBusy(true);
    setStatus(action === "activate" ? "Turning on auto-capture..." : "Saving your preference...");

    const timestamp = new Date().toISOString();
    const nextPrompt = {
      ...session.autoCapturePrompt,
      activatedAt: action === "activate" ? timestamp : session.autoCapturePrompt.activatedAt,
      dismissedAt: action === "dismiss" ? timestamp : session.autoCapturePrompt.dismissedAt,
    };

    try {
      const response = await relayFetch("/api/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          autoCapture: action === "activate" ? true : session.autoCapture,
          autoCapturePrompt: nextPrompt,
        }),
      });

      if (!response.ok) {
        setStatus(await readErrorMessage(response, "Could not update auto-capture."));
        return;
      }

      await setRelaySession({
        autoCapture: action === "activate" ? true : session.autoCapture,
        autoCapturePrompt: nextPrompt,
      });
      logExtensionEvent({
        level: "info",
        surface: "extension-sidebar",
        area: "settings",
        event: "auto_capture_toggled",
        message:
          action === "activate"
            ? "Enabled auto-capture from onboarding prompt."
            : "Dismissed auto-capture onboarding prompt.",
        context: {
          enabled: action === "activate" ? true : session.autoCapture,
          source: "onboarding_prompt",
          action,
        },
      });
      await refreshLocalSession();
      await refreshActiveProjectState();
      setStatus(action === "activate" ? "Auto-capture is on." : "Auto-capture stays off until you turn it on.");
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Could not update auto-capture.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshActiveProjectState() {
    if (activeStateRequestInFlight.current) return;

    const tab = await getActiveTab();
    if (!tab?.id) {
      setActiveState(emptyActiveState);
      return;
    }

    try {
      activeStateRequestInFlight.current = true;
      const response = await chrome.runtime.sendMessage({
        type: "RELAY_GET_ACTIVE_PROJECT_STATE",
        payload: { tabId: tab.id },
      });

      if (!isRelayActiveProjectState(response)) {
        setStatus(
          typeof response === "object" &&
            response &&
            "error" in response &&
            typeof response.error === "string"
            ? response.error
            : "Relay could not load this chat state.",
        );

        setActiveState((current) =>
          current.page.supported || current.projectId
            ? current
            : emptyActiveState,
        );
        return;
      }

      applyActiveState(response);
    } catch {
      setActiveState(emptyActiveState);
    } finally {
      activeStateRequestInFlight.current = false;
    }
  }

  async function openUpgradePage() {
    void chrome.runtime.sendMessage({ type: "RELAY_REFRESH_SESSION" });
    await chrome.tabs.create({ url: BILLING_UPGRADE_URL, active: true });
  }

  async function openDashboard(nextPath = "/dashboard") {
    setBusy(true);
    setStatus("Opening Relay dashboard…");
    const flowId = createExtensionFlowId("ext-dashboard");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_OPEN_DASHBOARD",
        payload: {
          nextPath,
          flowId,
        },
      })) as { ok?: boolean; reason?: string };

      if (!result?.ok) {
        throw new Error(result?.reason ?? "Failed to open the Relay dashboard.");
      }

      setStatus("Opened the Relay dashboard in a new tab.");
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Failed to open the Relay dashboard.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    console.log("[Relay] signInWithGoogle called");
    setBusy(true);
    setAuthenticating(true);
    setStatus("Signing in with Google…");
    const flowId = createExtensionFlowId("ext-auth");
    logExtensionEvent({
      level: "info",
      surface: "extension-sidebar",
      area: "auth",
      event: "google_sign_in.clicked",
      flowId,
      message: "User started Google sign-in from the extension panel.",
      context: {
        compact,
      },
    });

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_GOOGLE_SIGN_IN",
        payload: {
          deviceName: deviceName || defaultDeviceName(),
          flowId,
        },
      })) as { ok?: boolean; reason?: string };

      if (!result?.ok) {
        logExtensionEvent({
          level: "error",
          surface: "extension-sidebar",
          area: "auth",
          event: "google_sign_in.failed",
          flowId,
          message: result?.reason ?? "Google sign-in failed.",
        });
        setStatus(result?.reason ?? "Google sign-in failed.");
        return;
      }

      logExtensionEvent({
        level: "info",
        surface: "extension-sidebar",
        area: "auth",
        event: "google_sign_in.succeeded",
        flowId,
        message: "Google sign-in completed in the extension UI.",
      });
      setStatus("Signed in with Google.");
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      logExtensionEvent({
        level: "error",
        surface: "extension-sidebar",
        area: "auth",
        event: "google_sign_in.exception",
        flowId,
        message: "Google sign-in threw an exception in the extension UI.",
        error: cause,
      });
      setStatus(
        cause instanceof Error ? cause.message : "Google sign-in failed.",
      );
    } finally {
      setBusy(false);
      setAuthenticating(false);
    }
  }

  async function signInLocally() {
    setBusy(true);
    setAuthenticating(true);
    setStatus("Signing in locally…");
    const flowId = createExtensionFlowId("ext-local-auth");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_LOCAL_SIGN_IN",
        payload: {
          email: localAuthEmail.trim(),
          name: localAuthName.trim() || null,
          deviceName: deviceName || defaultDeviceName(),
          flowId,
        },
      })) as { ok?: boolean; reason?: string };

      if (!result?.ok) {
        setStatus(result?.reason ?? "Local sign-in failed.");
        return;
      }

      setStatus("Signed in locally.");
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Local sign-in failed.",
      );
    } finally {
      setBusy(false);
      setAuthenticating(false);
    }
  }

  async function signInWithEmail() {
    setBusy(true);
    setAuthenticating(true);
    setStatus(
      emailAuthAwaitingOtp
        ? "Verifying email…"
        : emailAuthMode === "sign-up" ? "Creating account…" : "Signing in…",
    );
    const flowId = createExtensionFlowId("ext-email-auth");
    logExtensionEvent({
      level: "info",
      surface: "extension-sidebar",
      area: "auth",
      event: "email_sign_in.clicked",
      flowId,
      message: `User started email ${emailAuthMode} from the extension panel.`,
      context: { intent: emailAuthMode },
    });

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_EMAIL_SIGN_IN",
        payload: {
          email: emailAuthEmail.trim(),
          password: emailAuthPassword,
          name: emailAuthName.trim() || null,
          intent: emailAuthMode,
          otp: emailAuthAwaitingOtp ? emailAuthOtp.trim() : null,
          deviceName: deviceName || defaultDeviceName(),
          flowId,
        },
      })) as { ok?: boolean; reason?: string; requiresOtp?: boolean; message?: string };

      if (!result?.ok) {
        logExtensionEvent({
          level: "error",
          surface: "extension-sidebar",
          area: "auth",
          event: "email_sign_in.failed",
          flowId,
          message: result?.reason ?? "Email sign-in failed.",
        });
        setStatus(result?.reason ?? "Email sign-in failed.");
        return;
      }

      if (result.requiresOtp) {
        setEmailAuthAwaitingOtp(true);
        setEmailAuthOtp("");
        setEmailAuthResendSeconds(60);
        setStatus(result.message ?? "Enter the verification code sent to your email.");
        return;
      }

      logExtensionEvent({
        level: "info",
        surface: "extension-sidebar",
        area: "auth",
        event: "email_sign_in.succeeded",
        flowId,
        message: `Email ${emailAuthMode} completed in the extension UI.`,
      });
      setStatus("Signed in with email.");
      setEmailAuthAwaitingOtp(false);
      setEmailAuthOtp("");
      setEmailAuthResendSeconds(0);
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      logExtensionEvent({
        level: "error",
        surface: "extension-sidebar",
        area: "auth",
        event: "email_sign_in.exception",
        flowId,
        message: "Email sign-in threw an exception in the extension UI.",
        error: cause,
      });
      setStatus(
        cause instanceof Error ? cause.message : "Email sign-in failed.",
      );
    } finally {
      setBusy(false);
      setAuthenticating(false);
    }
  }

  async function resendEmailOtp() {
    if (busy || emailAuthResendSeconds > 0) return;

    setBusy(true);
    setAuthenticating(true);
    setStatus("Sending a new code…");
    const flowId = createExtensionFlowId("ext-email-auth");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_EMAIL_SIGN_IN",
        payload: {
          email: emailAuthEmail.trim(),
          password: emailAuthPassword,
          name: emailAuthName.trim() || null,
          intent: "sign-up",
          otp: null,
          resendOnly: true,
          deviceName: deviceName || defaultDeviceName(),
          flowId,
        },
      })) as { ok?: boolean; reason?: string; requiresOtp?: boolean; message?: string };

      if (!result?.ok) {
        setStatus(result?.reason ?? "Could not resend verification code.");
        return;
      }

      setEmailAuthOtp("");
      setEmailAuthResendSeconds(60);
      setStatus(result.message ?? "Sent a new verification code.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not resend verification code.");
    } finally {
      setBusy(false);
      setAuthenticating(false);
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const description = newProjectDescription.trim();
    const projectUrl = newProjectUrl.trim();

    setBusy(true);
    setStatus("Creating project…");
    const flowId = createExtensionFlowId("ext-project");
    const slug = slugify(name).slice(0, 80);
    logExtensionEvent({
      level: "info",
      surface: "extension-sidebar",
      area: "projects",
      event: "project_create.clicked",
      flowId,
      message: "User submitted project creation from extension onboarding.",
      context: {
        name,
        slug,
      },
    });

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_CREATE_PROJECT",
        payload: { name, slug, description: description || null, projectUrl: projectUrl || null, flowId },
      })) as {
        ok?: boolean;
        reason?: string;
        project?: { id: string; name: string };
      };

      if (!result?.ok) {
        logExtensionEvent({
          level: "error",
          surface: "extension-sidebar",
          area: "projects",
          event: "project_create.failed",
          flowId,
          message: result?.reason ?? "Project creation failed.",
          context: {
            name,
            slug,
          },
        });
        setStatus(result?.reason ?? "Project creation failed.");
        return;
      }

      logExtensionEvent({
        level: "info",
        surface: "extension-sidebar",
        area: "projects",
        event: "project_create.succeeded",
        flowId,
        message: `Created project ${result.project?.id ?? ""} from extension onboarding.`,
        context: {
          projectId: result.project?.id ?? null,
          name: result.project?.name ?? name,
        },
      });
      setNewProjectUrl("");
      setNewProjectName("");
      setNewProjectDescription("");
      setStatus(`Created project "${result.project?.name}".`);
      setSwitcherMode("list");
      setProjectSwitcherOpen(false);
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      logExtensionEvent({
        level: "error",
        surface: "extension-sidebar",
        area: "projects",
        event: "project_create.exception",
        flowId,
        message: "Project creation threw an exception in the extension UI.",
        error: cause,
      });
      setStatus(
        cause instanceof Error ? cause.message : "Project creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateProject() {
    const name = switcherEditName.trim();
    if (!name || !switcherEditTarget) return;
    setBusy(true);
    setStatus("Saving project…");
    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_UPDATE_PROJECT",
        payload: {
          projectId: switcherEditTarget.id,
          name,
          description: switcherEditDescription.trim() || null,
          projectUrl: switcherEditUrl.trim() || null,
        },
      })) as { ok?: boolean; reason?: string };
      if (!result?.ok) {
        setStatus(result?.reason ?? "Project update failed.");
        return;
      }
      setStatus(`Updated "${name}".`);
      setSwitcherEditTarget(null);
      setSwitcherMode("list");
      setProjectSwitcherOpen(false);
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Project update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    if (!deletingProject) return;
    setBusy(true);
    setStatus("Deleting project…");
    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_DELETE_PROJECT",
        payload: { projectId: deletingProject.id },
      })) as { ok?: boolean; reason?: string };
      if (!result?.ok) {
        setStatus(result?.reason ?? "Project deletion failed.");
        return;
      }
      setStatus("Project deleted.");
      setDeletingProject(null);
      setDeleteConfirmText("");
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Project deletion failed.");
    } finally {
      setBusy(false);
    }
  }

  async function scanProjectUrl() {
    const url = newProjectUrl.trim();
    if (!url) {
      setStatus("Enter a project URL to scan.");
      return;
    }

    setProjectScanPending(true);
    setStatus("Scanning project URL…");
    const flowId = createExtensionFlowId("ext-project-scan");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_SCAN_PROJECT_URL",
        payload: { url, flowId },
      })) as {
        ok?: boolean;
        reason?: string;
        result?: { name: string | null; description: string | null; url: string };
      };

      if (!result?.ok) {
        setStatus(result?.reason ?? "URL scan failed.");
        return;
      }

      const scan = result.result;
      if (scan?.url) setNewProjectUrl(scan.url);
      if (!newProjectName.trim() && scan?.name) setNewProjectName(scan.name);
      if (!newProjectDescription.trim() && scan?.description) {
        setNewProjectDescription(scan.description);
      }
      setStatus("Project URL scanned.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "URL scan failed.");
    } finally {
      setProjectScanPending(false);
    }
  }

  async function insertProjectBrief() {
    const tab = await getActiveTab();
    if (!tab?.id) {
      setStatus("Open a supported AI chat first.");
      return;
    }

    setBusy(true);
    setStatus("Inserting project brief…");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_INSERT_PROJECT_BRIEF",
        payload: {
          tabId: tab.id,
          source: "sidebar",
        },
      })) as { ok?: boolean; reason?: string; error?: string };

      if (!result?.ok) {
        setStatus(
          result?.reason ?? result?.error ?? "Insert project brief failed.",
        );
        return;
      }

      setStatus("Inserted the project brief.");
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Insert project brief failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function captureNow() {
    const tab = await getActiveTab();
    if (!tab?.id || !activeState.page.supported) {
      setStatus("Capture now works only on a supported AI tab.");
      return;
    }

    if (!activeState.projectId) {
      setStatus("Choose a project first.");
      return;
    }

    setBusy(true);
    setStatus("Capturing visible turns…");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_CAPTURE_VISIBLE",
        payload: {
          projectId: activeState.projectId,
          tabId: tab.id,
        },
      })) as {
        ok?: boolean;
        turns?: number;
        reason?: string;
        digestQueued?: boolean;
      };

      setStatus(
        result?.ok
          ? `Captured ${result.turns ?? 0} visible turns.${result?.digestQueued ? " Relay is updating your project brief." : ""}`
          : (result?.reason ?? "Capture failed."),
      );

      if (result?.ok) {
        await refreshLocalSession();
        await refreshActiveProjectState();
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Capture failed.");
    } finally {
      setBusy(false);
    }
  }

  async function associateCurrentChat() {
    const tab = await getActiveTab();
    if (!tab?.id || !activeState.page.supported) {
      setStatus("Associate chat works only on a supported AI tab.");
      return;
    }

    if (!activeState.projectId) {
      setStatus("Choose a project first.");
      return;
    }

    setBusy(true);
    setStatus("Associating this chat…");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_CAPTURE_VISIBLE",
        payload: {
          projectId: activeState.projectId,
          tabId: tab.id,
        },
      })) as {
        ok?: boolean;
        turns?: number;
        reason?: string;
        digestQueued?: boolean;
      };

      setStatus(
        result?.ok
          ? `Associated this chat with the selected project.${result?.digestQueued ? " Relay is updating your project brief." : ""}`
          : (result?.reason ?? "Associate chat failed."),
      );

      if (result?.ok) {
        await refreshLocalSession();
        await refreshActiveProjectState();
      }
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Associate chat failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleProjectChange(nextProjectId: string) {
    if (!nextProjectId) return;

    const tab = await getActiveTab();
    const associationAware =
      activeState.chatAssociation.status === "pending" ||
      activeState.chatAssociation.status === "held" ||
      activeState.chatAssociation.status === "saved";
    const nextProject =
      activeState.projectOptions.find((project) => project.id === nextProjectId) ??
      null;
    const previousState = activeState;
    setBusy(true);

    try {
      if (associationAware && nextProject) {
        setActiveState((current) => ({
          ...current,
          projectId: nextProjectId,
          projectName: nextProject.name,
          chatAssociation: {
            ...current.chatAssociation,
            projectId: nextProjectId,
            projectName: nextProject.name,
            status:
              current.chatAssociation.status === "saved"
                ? "pending"
                : current.chatAssociation.status,
            reason:
              current.chatAssociation.status === "saved"
                ? `Moving this chat to ${nextProject.name}…`
                : current.chatAssociation.status === "pending"
                  ? `Relay will save this chat to ${nextProject.name} in 10 seconds unless you cancel.`
                  : `Relay wants confirmation before saving this chat to ${nextProject.name}.`,
          },
        }));
      }

      const result = (await chrome.runtime.sendMessage(
        associationAware
          ? {
              type: "RELAY_SET_CHAT_ASSOCIATION_PROJECT",
              payload: {
                projectId: nextProjectId,
                tabId: tab?.id,
                source: "sidebar",
              },
            }
          : {
              type: "RELAY_SET_ACTIVE_PROJECT",
              payload: {
                projectId: nextProjectId,
                tabId: tab?.id,
              },
            },
      )) as { ok?: boolean; reason?: string };
      if (!result?.ok) {
        throw new Error(result?.reason ?? "Project switch failed.");
      }
      await setRelaySession({
        projectId: nextProjectId,
      });
      setStatus(
        associationAware
          ? activeState.chatAssociation.status === "saved"
            ? "Chat moved to the selected project."
            : "Chat association updated."
          : "Project switched.",
      );
      setProjectSwitcherOpen(false);
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      if (associationAware) {
        setActiveState(previousState);
      }
      setStatus(
        cause instanceof Error ? cause.message : "Project switch failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runBusyAction(
    pendingMessage: string,
    successMessage: string,
    task: () => Promise<void>,
  ) {
    setBusy(true);
    setStatus(pendingMessage);

    try {
      await task();
      setStatus(successMessage);
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function patchProjectState(payload: Record<string, unknown>) {
    const projectId = activeState.projectId ?? session?.projectId ?? "";
    if (!projectId) {
      throw new Error("Choose a project first.");
    }

    const response = await relayFetch(`/api/projects/${projectId}/state`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Project state update failed."));
    }
  }

  async function loadHiddenItems(section: ContextSection) {
    const projectId = activeState.projectId ?? session?.projectId ?? "";
    if (!projectId) {
      return [];
    }

    const response = await relayFetch(`/api/projects/${projectId}`);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Project state lookup failed."));
    }

    const payload = (await response.json()) as {
      dashboard?: {
        stateOverrides?: {
          hiddenDecisions?: string[];
          hiddenConstraints?: string[];
          hiddenOpenTasks?: string[];
        } | null;
      };
    };

    const stateOverrides = payload.dashboard?.stateOverrides;
    return (
      stateOverrides?.[hiddenFieldBySection[section]]?.slice() ?? []
    );
  }

  async function addContext(section: ContextSection) {
    const projectId = activeState.projectId ?? session?.projectId ?? "";
    const content = drafts[section].trim();
    if (!projectId || !content) return;

    await runBusyAction(
      `Saving ${sectionLabels[section].toLowerCase()}…`,
      `${sectionLabels[section]} updated.`,
      async () => {
        const response = await relayFetch(`/api/projects/${projectId}/memory`, {
          method: "POST",
          body: JSON.stringify({
            type: memoryTypeBySection[section],
            title: null,
            content,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "Context item creation failed."));
        }

        setDrafts((current) => ({
          ...current,
          [section]: "",
        }));
      },
    );
  }

  async function removeContextItem(section: ContextSection, item: ContextItem) {
    await runBusyAction(
      "Updating project context…",
      "Project context updated.",
      async () => {
        if (item.source === "manual" && item.memoryId) {
          const response = await relayFetch(`/api/memory/${item.memoryId}`, {
            method: "DELETE",
          });
          if (!response.ok) {
            throw new Error(await readErrorMessage(response, "Manual context removal failed."));
          }
          return;
        }

        const hiddenItems = await loadHiddenItems(section);
        await patchProjectState({
          [hiddenFieldBySection[section]]: Array.from(new Set([...hiddenItems, item.text])),
        });
      },
    );
  }

  async function removeNote(memoryId: string) {
    await runBusyAction(
      "Removing note…",
      "Note removed.",
      async () => {
        const response = await relayFetch(`/api/memory/${memoryId}`, {
          method: "DELETE",
        });
        if (!response.ok && response.status !== 204) {
          throw new Error(await readErrorMessage(response, "Note removal failed."));
        }
      },
    );
  }

  function startEdit(item: ContextItem) {
    setEditingKey(item.key);
    setEditingText(item.text);
  }

  async function saveEdit(section: ContextSection, item: ContextItem) {
    const nextText = editingText.trim();
    if (!nextText) return;

    await runBusyAction(
      "Saving context change…",
      "Project context updated.",
      async () => {
        if (item.source === "manual" && item.memoryId) {
          const response = await relayFetch(`/api/memory/${item.memoryId}`, {
            method: "PATCH",
            body: JSON.stringify({
              content: nextText,
            }),
          });

          if (!response.ok) {
            throw new Error(await readErrorMessage(response, "Manual context update failed."));
          }
        } else {
          const projectId = activeState.projectId ?? session?.projectId ?? "";
          const createResponse = await relayFetch(`/api/projects/${projectId}/memory`, {
            method: "POST",
            body: JSON.stringify({
              type: memoryTypeBySection[section],
              title: null,
              content: nextText,
            }),
          });
          if (!createResponse.ok) {
            throw new Error(await readErrorMessage(createResponse, "Manual replacement failed."));
          }

          const hiddenItems = await loadHiddenItems(section);
          await patchProjectState({
            [hiddenFieldBySection[section]]: Array.from(new Set([...hiddenItems, item.text])),
          });
        }

        setEditingKey(null);
        setEditingText("");
      },
    );
  }

  async function updateChatAssociation(archived: boolean) {
    const tab = await getActiveTab();
    const association = activeState.chatAssociation;
    if (!tab?.id || !association.projectId || !association.sessionId) {
      setStatus("This chat is not currently attached to a saved Relay session.");
      return;
    }

    const confirmMessage = archived
      ? "Detach this chat from the project and rebuild the project state?"
      : "Restore this chat back into the project state?";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    await runBusyAction(
      archived ? "Detaching this chat…" : "Restoring this chat…",
      archived ? "Chat detached from the project." : "Chat restored to the project.",
      async () => {
        const result = (await chrome.runtime.sendMessage({
          type: "RELAY_SET_CHAT_ASSOCIATION_ARCHIVED",
          payload: {
            tabId: tab.id,
            projectId: association.projectId,
            sessionId: association.sessionId,
            archived,
          },
        })) as { ok?: boolean; reason?: string };

        if (!result?.ok) {
          throw new Error(result?.reason ?? "Association update failed.");
        }
      },
    );
  }

  async function approveHeldChat() {
    const tab = await getActiveTab();
    if (!tab?.id || !activeState.chatAssociation.projectId) {
      setStatus("Relay needs a project candidate before you can approve this chat.");
      return;
    }

    const previousAssociation = activeState.chatAssociation;
    setAssociationAction("approving_held");
    setBusy(true);
    setStatus("Saving this chat to the suggested project…");
    setActiveState((current) => ({
      ...current,
      chatAssociation: {
        ...current.chatAssociation,
        status: "pending",
        reason: `Saving this chat to ${current.chatAssociation.projectName ?? "the selected project"}…`,
      },
    }));

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_CAPTURE_VISIBLE",
        payload: {
          tabId: tab.id,
          projectId: previousAssociation.projectId,
        },
      })) as { ok?: boolean; reason?: string };

      if (!result?.ok) {
        throw new Error(result?.reason ?? "Capture failed.");
      }

      setStatus("Chat saved to the suggested project.");
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Capture failed.");
      setActiveState((current) => ({
        ...current,
        chatAssociation: previousAssociation,
      }));
    } finally {
      setAssociationAction(null);
      setBusy(false);
    }
  }

  async function dismissHeldChat() {
    const tab = await getActiveTab();
    if (!tab?.id) {
      setStatus("Open a supported AI chat first.");
      return;
    }

    await runBusyAction(
      "Ignoring this chat for automatic capture…",
      "Relay will ignore this chat until you save it manually.",
      async () => {
        const result = (await chrome.runtime.sendMessage({
          type: "RELAY_DISMISS_CAPTURE_REVIEW",
          payload: { tabId: tab.id },
        })) as { ok?: boolean; reason?: string };

        if (!result?.ok) {
          throw new Error(result?.reason ?? "Dismiss failed.");
        }
      },
    );
  }

  const selectedProjectId =
    activeState.projectId ??
    session?.projectId ??
    session?.assumedProjectId ??
    "";
  const dashboardPath = (() => {
    const url = new URL("/dashboard", "http://relay.local");
    if (selectedProjectId) {
      url.searchParams.set("project", selectedProjectId);
    }
    return `${url.pathname}${url.search}`;
  })();
  const contextSections: ContextSection[] = [
    "decisions",
    "tasks",
    "constraints",
  ];
  const shouldShowIssue =
    Boolean(activeState.issue) &&
    (!activeState.canInsert ||
      activeState.remoteStatus === "stale" ||
      activeState.remoteStatus === "unavailable");
  const insertButtonState = deriveInsertButtonState(activeState);
  const displayedPlan = resolveDisplayedPlan(activeState);
  const shouldShowUpgrade = displayedPlan === "free" || displayedPlan === "starter";
  const shouldRenderAssociationCard = shouldShowAssociationCard({
    onboardingStatus: activeState.onboarding.status,
    supported: activeState.page.supported,
    freshChat: Boolean(activeState.page.isFreshChat),
    turns: activeState.page.turns ?? 0,
  });
  const associationPresentation =
    activeState.chatAssociation.status !== "none"
      ? deriveAssociationCardPresentation(activeState.chatAssociation)
      : null;
  const unresolvedAssociationPresentation =
    activeState.chatAssociation.status === "none"
      ? deriveUnresolvedAssociationCardPresentation({
          projectName: activeState.projectName,
          checking:
            activeState.capturePending ||
            activeState.remoteStatus === "loading" ||
            (activeState.remoteStatus === "stale" &&
              !activeState.lastSuccessfulSyncAt),
        })
      : null;

  return (
    <div
      className={`${styles.shell} ${compact ? styles.compact : styles.expanded}`}
      data-theme={resolvedTheme}
    >
      {/* ─── Header ─── */}
      <header className={styles.header}>
        <button
          type="button"
          className={styles.logoLink}
          aria-label="Open dashboard"
          title="Open dashboard"
          onClick={() => void openDashboard(dashboardPath)}
        >
          <img className={styles.logoMark} src={relayIconUrl} alt="Relay" />
        </button>
        {displayedPlan === "pro" ? (
          <span className={styles.proChip} aria-label="Pro plan">Pro</span>
        ) : displayedPlan === "starter" ? (
          <span className={styles.starterChip} aria-label="Starter plan">Starter</span>
        ) : null}
        <div className={styles.headerSpacer} />
        <div className={styles.headerSlotRight}>
          {session?.connected ? (
            <button
              type="button"
              className={styles.headerIconButton}
              aria-label="Guide"
              title="Getting started guide"
              onClick={() => setShowWalkthrough(true)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          ) : null}
          {session?.connected ? (
            <button
              type="button"
              className={styles.headerIconButton}
              aria-label={panelMode === "settings" ? "Back" : "Settings"}
              title={panelMode === "settings" ? "Back" : "Settings"}
              onClick={() =>
                setPanelMode((current) =>
                  current === "settings" ? "main" : "settings",
                )
              }
            >
              {panelMode === "settings" ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 3L5 7l4 4" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      </header>

      {shouldShowAutoCapturePrompt ? (
        <div className={styles.warningBanner}>
          <div className={styles.warningContent}>
            <span className={styles.warningTitle}>Auto-capture is off by default.</span>
            <button
              className={styles.warningPrimaryButton}
              disabled={busy}
              onClick={() => void updateAutoCapturePrompt("activate")}
            >
              {busy ? "Working…" : "Turn on"}
            </button>
          </div>
          <button
            className={styles.warningDismissButton}
            disabled={busy}
            onClick={() => void updateAutoCapturePrompt("dismiss")}
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l11 11M12 1L1 12" />
            </svg>
          </button>
        </div>
      ) : null}

      {panelMode === "settings" && session?.connected ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Settings</h2>

          <div className={styles.settingsGroup}>
            <span className={styles.settingsLabel}>Appearance</span>
            <div className={styles.themeOptions}>
              {(["system", "light", "dark"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={
                    themeMode === mode
                      ? `${styles.themeOption} ${styles.themeOptionActive}`
                      : styles.themeOption
                  }
                  onClick={() => void changeThemeMode(mode)}
                >
                  {mode === "system" ? "System" : mode === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.settingsGroup}>
            <span className={styles.settingsLabel}>Behavior</span>
            <label className={styles.settingsToggleRow}>
              <span className={styles.settingsToggleCopy}>
                <span className={styles.settingsToggleTitle}>Auto-capture</span>
                <span className={styles.settingsToggleHint}>
                  Quietly capture useful turns as you chat.
                </span>
              </span>
              <input
                type="checkbox"
                className={styles.settingsToggleInput}
                checked={userSettings?.autoCapture ?? session?.autoCapture ?? true}
                disabled={userSettingsBusy || !userSettings}
                onChange={(event) =>
                  void patchUserSettings({ autoCapture: event.target.checked })
                }
              />
            </label>
            <label className={styles.settingsToggleRow}>
              <span className={styles.settingsToggleCopy}>
                <span className={styles.settingsToggleTitle}>Auto-show inline chip</span>
                <span className={styles.settingsToggleHint}>
                  Show the chip automatically on new chats. When off, press ⌘⇧I (Ctrl+Shift+I) to summon it.
                </span>
              </span>
              <input
                type="checkbox"
                className={styles.settingsToggleInput}
                checked={userSettings?.showSidepanelOnSupportedSites ?? true}
                disabled={userSettingsBusy || !userSettings}
                onChange={(event) =>
                  void patchUserSettings({
                    showSidepanelOnSupportedSites: event.target.checked,
                  })
                }
              />
            </label>
          </div>

          <div className={styles.settingsGroup}>
            <span className={styles.settingsLabel}>Platforms</span>
            <p className={styles.settingsHint}>
              Turn the inline chip and capture on or off per site.
            </p>
            <div className={styles.platformList}>
              {supportedPlatforms.map((platform) => {
                const enabled =
                  userSettings?.enabledPlatforms?.includes(platform) ?? true;
                return (
                  <label key={platform} className={styles.platformRow}>
                    <span className={styles.platformRowLabel}>
                      <PlatformIcon platform={platform} size={14} />
                      <span>{prettyPlatformName(platform)}</span>
                    </span>
                    <input
                      type="checkbox"
                      className={styles.settingsToggleInput}
                      checked={enabled}
                      disabled={userSettingsBusy || !userSettings}
                      onChange={(event) =>
                        void togglePlatformEnabled(platform, event.target.checked)
                      }
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className={styles.settingsGroup}>
            <span className={styles.settingsLabel}>Account</span>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={signOutBusy}
              onClick={() => void handleSignOut()}
            >
              {signOutBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>

          <p className={styles.settingsVersion}>Relay · v{chrome?.runtime?.getManifest?.()?.version ?? "0.3.0"}</p>
        </section>
      ) : authenticating ? (
        <section className={styles.panel}>
          <p className={styles.copy}>{emailAuthMode === "sign-up" ? "Creating account…" : "Signing in…"}</p>
        </section>
      ) : activeState.viewState === "disconnected" || !session?.connected ? (
        /* ─── Connect state ─── */
        <section className={`${styles.panel} ${styles.authPanel}`}>
          <h2 className={styles.authTitle}>
            {emailAuthMode === "sign-up" ? "Create your account" : "Sign in to Relay"}
          </h2>
          <p className={styles.authCopy}>
            {emailAuthMode === "sign-up"
              ? "Relay captures useful work quietly and keeps your next chat ready."
              : "Sign in once. Relay captures useful work quietly and keeps your next chat ready."}
          </p>

          {extensionAuthProvider === "local" ? (
            <>
              <label className={`${styles.field} ${styles.authField}`}>
                <span>Email</span>
                <input
                  value={localAuthEmail}
                  onChange={(event) => setLocalAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                />
              </label>

              <label className={`${styles.field} ${styles.authField}`}>
                <span>Name</span>
                <input
                  value={localAuthName}
                  onChange={(event) => setLocalAuthName(event.target.value)}
                  placeholder="Display name (optional)"
                />
              </label>

              <button
                className={`${styles.primaryButton} ${styles.authPrimaryButton}`}
                disabled={busy || !localAuthEmail.trim()}
                onClick={() => void signInLocally()}
              >
                {busy ? "Signing in…" : "Sign in locally"}
              </button>
            </>
          ) : emailAuthAwaitingOtp ? (
            <>
              <button
                type="button"
                className={styles.linkButton}
                style={{ marginTop: 0 }}
                onClick={() => {
                  setEmailAuthAwaitingOtp(false);
                  setEmailAuthOtp("");
                  setEmailAuthResendSeconds(0);
                  setStatus("");
                }}
              >
                ← Back
              </button>

              <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>Check your email</h3>
              <p className={styles.copy}>
                Sent a 6-digit code to {emailAuthEmail}
              </p>
              <p className={styles.mutedCopy}>Codes expire after 5 minutes.</p>

              <div style={{ marginTop: 20 }}>
                <OtpCells
                  value={emailAuthOtp}
                  onChange={setEmailAuthOtp}
                  disabled={busy}
                />
              </div>

              <button
                className={`${styles.primaryButton} ${styles.authPrimaryButton}`}
                disabled={busy || emailAuthOtp.length < 6}
                onClick={() => void signInWithEmail()}
              >
                {busy ? "Verifying…" : "Verify email"}
              </button>

              <button
                className={styles.linkButton}
                disabled={busy || emailAuthResendSeconds > 0}
                onClick={() => void resendEmailOtp()}
              >
                {emailAuthResendSeconds > 0
                  ? `Resend code in ${emailAuthResendSeconds}s`
                  : "Resend code"}
              </button>
            </>
          ) : (
            <>
              <button
                className={`${styles.primaryButton} ${styles.authProviderButton}`}
                disabled={busy}
                onClick={() => void signInWithGoogle()}
              >
                <span className={styles.authProviderIcon}>G</span>
                {busy ? "Signing in…" : "Continue with Google"}
              </button>

              <div className={`${styles.dividerRow} ${styles.authDividerRow}`}>
                <div className={styles.dividerLine} />
                <span className={styles.authDividerLabel}>Or continue with email</span>
                <div className={styles.dividerLine} />
              </div>

              {emailAuthMode === "sign-up" && (
                <label className={`${styles.field} ${styles.authField}`}>
                  <span>Full name</span>
                  <input
                    value={emailAuthName}
                    onChange={(event) => setEmailAuthName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className={`${styles.field} ${styles.authField}`}>
                <span>Email address</span>
                <input
                  value={emailAuthEmail}
                  onChange={(event) => setEmailAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                />
              </label>

              <label className={`${styles.field} ${styles.authField}`}>
                <span>Password</span>
                <input
                  value={emailAuthPassword}
                  onChange={(event) => setEmailAuthPassword(event.target.value)}
                  placeholder={emailAuthMode === "sign-up" ? "Create a password" : "Password"}
                  type="password"
                  autoComplete={emailAuthMode === "sign-up" ? "new-password" : "current-password"}
                />
                {emailAuthMode === "sign-up" && emailAuthPassword.length > 0 ? (() => {
                  const pw = emailAuthPassword;
                  const types = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
                  const score = pw.length === 0 ? 0
                    : pw.length < 6 ? 1
                    : pw.length < 8 || (pw.length >= 8 && types < 2) ? 2
                    : pw.length >= 8 && types === 2 ? 3
                    : 4;
                  const colors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e"];
                  const labels = ["", "Weak", "Fair", "Good", "Strong"];
                  return (
                    <>
                      <div
                        className={styles.strengthBar}
                        style={{ width: `${score * 25}%`, backgroundColor: colors[score] }}
                      />
                      <div className={styles.strengthRow}>
                        <span className={styles.strengthLabel} style={{ color: colors[score] }}>{labels[score]}</span>
                      </div>
                    </>
                  );
                })() : emailAuthMode === "sign-up" ? (
                  <small className={styles.authFieldHint}>Must be at least 8 characters.</small>
                ) : null}
              </label>

              <button
                className={`${styles.primaryButton} ${styles.authPrimaryButton}`}
                disabled={
                  busy ||
                  !emailAuthEmail.trim() ||
                  emailAuthPassword.length < 8
                }
                onClick={() => void signInWithEmail()}
              >
                {busy
                  ? emailAuthMode === "sign-up" ? "Creating account…" : "Signing in…"
                  : emailAuthMode === "sign-up" ? "Create account" : "Sign in with email"}
              </button>

              <button
                className={styles.linkButton}
                onClick={() => {
                  setEmailAuthMode(emailAuthMode === "sign-in" ? "sign-up" : "sign-in");
                  setEmailAuthAwaitingOtp(false);
                  setEmailAuthOtp("");
                  setStatus("");
                }}
              >
                {emailAuthMode === "sign-in"
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </section>
      ) : activeState.viewState === "connected-empty" ? (
        /* ─── No projects yet ─── */
        <>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Create your first project</h2>
            <p className={styles.copy}>
              Projects group your chats and context. Finish setup here or continue in the dashboard.
            </p>

            <label className={styles.field}>
              <span>Project URL</span>
              <input
                value={newProjectUrl}
                onChange={(event) => setNewProjectUrl(event.target.value)}
                placeholder="https://example.com"
                type="url"
              />
            </label>

            <button
              className={styles.secondaryButton}
              disabled={busy || projectScanPending || !newProjectUrl.trim()}
              onClick={() => void scanProjectUrl()}
            >
              {projectScanPending ? "Scanning…" : "Scan URL"}
            </button>

            <label className={styles.field}>
              <span>Project name</span>
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="e.g. My App"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createProject();
                }}
              />
            </label>

            <label className={styles.field}>
              <span>Project description</span>
              <textarea
                value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)}
                placeholder="What is this project for?"
                maxLength={200}
              />
            </label>

            <div className={styles.advancedButtons}>
              <button
                className={styles.primaryButton}
                disabled={busy || !newProjectName.trim()}
                onClick={() => void createProject()}
              >
                {busy ? "Creating…" : "Create project"}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => {
                  const params = new URLSearchParams();
                  if (newProjectName.trim()) params.set("projectName", newProjectName.trim());
                  if (newProjectDescription.trim()) params.set("projectDescription", newProjectDescription.trim());
                  if (newProjectUrl.trim()) params.set("projectUrl", newProjectUrl.trim());
                  const query = params.toString();
                  void openDashboard(query ? `/dashboard?${query}` : "/dashboard");
                }}
              >
                Finish in dashboard
              </button>
            </div>
          </section>
        </>
      ) : activeState.viewState === "connected-loading" ? (
        <section className={styles.panel}>
          <div>
            <h2 className={styles.projectName}>
              {activeState.projectName ?? "Checking project"}
            </h2>
            <p className={styles.copy}>
              Relay is keeping the last known project while this chat reloads.
            </p>
          </div>

          <div className={styles.statusRow}>
            <span className={`${styles.dot} ${styles.dotWaiting}`} />
            <span className={styles.statusText}>Checking this chat…</span>
          </div>

          <div className={styles.trustLine}>
            {activeState.trust.recentChatCount > 0 ||
            activeState.trust.savedContextCount > 0 ? (
              <span>
                {activeState.trust.recentChatCount} chats ·{" "}
                {activeState.trust.savedContextCount} saved items
              </span>
            ) : (
              <span>{activeState.trustLine}</span>
            )}
            {activeState.freshnessText ? (
              <span> · {activeState.freshnessText}</span>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          {/* ─── Project + Status ─── */}
          <section className={styles.panel}>
            <div className={styles.panelTopRow}>
              <div style={{ position: "relative", flex: 1 }}>
                <div
                  className={styles.projectRow}
                  onClick={() => {
                    setSwitcherMode("list");
                    setProjectSwitcherOpen((v) => !v);
                  }}
                >
                  <h2 className={styles.projectName}>
                    {activeState.projectName ?? "No project"}
                  </h2>
                  <svg
                    className={`${styles.projectChevron} ${projectSwitcherOpen ? styles.projectChevronOpen : ""}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="4 6 8 10 12 6" />
                  </svg>
                </div>

                {projectSwitcherOpen ? (
                  <div className={styles.projectDropdown}>
                    {switcherMode === "list" ? (
                      <>
                        {activeState.projectOptions.map((project) => (
                          <div key={project.id} className={styles.projectOptionRow}>
                            <button
                              className={`${styles.projectOption} ${project.id === selectedProjectId ? styles.projectOptionActive : ""}`}
                              onClick={() => void handleProjectChange(project.id)}
                            >
                              {project.id === selectedProjectId ? "✓ " : ""}
                              {project.name}
                            </button>
                            <button
                              className={styles.projectOptionDots}
                              title="Edit or delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSwitcherEditTarget(project);
                                setSwitcherEditName(project.name);
                                setSwitcherEditDescription(project.description ?? "");
                                setSwitcherEditUrl(project.projectUrl ?? "");
                                setSwitcherMode("edit");
                              }}
                            >
                              ···
                            </button>
                          </div>
                        ))}
                        <button
                          className={styles.projectOptionNew}
                          onClick={() => {
                            setNewProjectName("");
                            setNewProjectDescription("");
                            setNewProjectUrl("");
                            setSwitcherMode("create");
                          }}
                        >
                          + New project
                        </button>
                      </>
                    ) : switcherMode === "create" ? (
                      <div className={styles.switcherForm}>
                        <p className={styles.switcherFormTitle}>New project</p>
                        <input
                          className={styles.switcherInput}
                          placeholder="Project name"
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          autoFocus
                          disabled={busy}
                          onKeyDown={(e) => { if (e.key === "Escape") setSwitcherMode("list"); }}
                        />
                        <textarea
                          className={styles.switcherTextarea}
                          placeholder="Description (optional)"
                          value={newProjectDescription}
                          onChange={(e) => setNewProjectDescription(e.target.value)}
                          disabled={busy}
                          rows={2}
                        />
                        <div className={styles.switcherFormRow}>
                          <button
                            className={styles.switcherSaveBtn}
                            disabled={busy || !newProjectName.trim()}
                            onClick={() => void createProject()}
                          >
                            {busy ? "Creating…" : "Create"}
                          </button>
                          <button className={styles.switcherCancelBtn} onClick={() => setSwitcherMode("list")}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : switcherMode === "edit" && switcherEditTarget ? (
                      <div className={styles.switcherForm}>
                        <p className={styles.switcherFormTitle}>Edit project</p>
                        <input
                          className={styles.switcherInput}
                          placeholder="Project name"
                          value={switcherEditName}
                          onChange={(e) => setSwitcherEditName(e.target.value)}
                          autoFocus
                          disabled={busy}
                          onKeyDown={(e) => { if (e.key === "Escape") setSwitcherMode("list"); }}
                        />
                        <textarea
                          className={styles.switcherTextarea}
                          placeholder="Description (optional)"
                          value={switcherEditDescription}
                          onChange={(e) => setSwitcherEditDescription(e.target.value)}
                          disabled={busy}
                          rows={2}
                        />
                        <div className={styles.switcherFormRow}>
                          <button
                            className={styles.switcherSaveBtn}
                            disabled={busy || !switcherEditName.trim()}
                            onClick={() => void updateProject()}
                          >
                            {busy ? "Saving…" : "Save"}
                          </button>
                          <button className={styles.switcherCancelBtn} onClick={() => setSwitcherMode("list")}>
                            Cancel
                          </button>
                          <button
                            className={styles.switcherDeleteBtn}
                            disabled={busy}
                            onClick={() => {
                              setDeletingProject(switcherEditTarget);
                              setDeleteConfirmText("");
                              setProjectSwitcherOpen(false);
                              setSwitcherMode("list");
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.statusRow}>
              <span
                className={`${styles.dot} ${activeState.canInsert ? styles.dotReady : styles.dotWaiting}`}
              />
              <div className={styles.statusCopy}>
                <span className={styles.statusText}>{activeState.message}</span>
                {shouldShowIssue ? (
                  <div className={styles.infoWrap}>
                    <button
                      className={styles.infoButton}
                      type="button"
                      aria-label="Issue details"
                    >
                      i
                    </button>
                    <div className={styles.tooltip}>
                      {activeState.issue?.detail}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Primary CTA */}
            <button
              className={styles.primaryButton}
              disabled={busy || insertButtonState.disabled}
              onClick={() => void insertProjectBrief()}
            >
              {insertButtonState.shimmering ? (
                <span className={styles.shimmerText}>Inserting…</span>
              ) : (
                insertButtonState.label
              )}
            </button>


            {/* Trust line */}
            <div className={styles.trustLine}>
              {activeState.trust.recentChatCount > 0 ||
              activeState.trust.savedContextCount > 0 ? (
                <span>
                  {activeState.trust.recentChatCount} chats ·{" "}
                  {activeState.trust.savedContextCount} saved items
                </span>
              ) : (
                <span>{activeState.trustLine}</span>
              )}
              {activeState.freshnessText ? (
                <span> · {activeState.freshnessText}</span>
              ) : null}
              {activeState.capturePending ? <span> · updating…</span> : null}
            </div>
            {activeState.lastBudgetStatus ? (
              <div
                className={styles.budgetLine}
                data-warning={activeState.lastBudgetStatus.aiRemaining === 0 ? "" : undefined}
              >
                {activeState.lastBudgetStatus.aiRemaining === 0 ? (
                  <span>
                    Daily limit reached · resets midnight UTC
                    {shouldShowUpgrade ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className={styles.upgradeLink}
                          onClick={() => void openUpgradePage()}
                        >
                          Upgrade plan
                        </button>
                      </>
                    ) : null}
                  </span>
                ) : (
                  <span>
                    ⚡ {activeState.lastBudgetStatus.aiRemaining}/
                    {activeState.lastBudgetStatus.aiLimit} left today
                    {shouldShowUpgrade ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className={styles.upgradeLink}
                          onClick={() => void openUpgradePage()}
                        >
                          Upgrade
                        </button>
                      </>
                    ) : null}
                  </span>
                )}
              </div>
            ) : null}
          </section>

          {shouldRenderAssociationCard ? (
            <section className={styles.panel}>
              <div className={styles.associationHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Chat association</h2>
                  <p className={styles.copy}>
                    {associationPresentation?.summary ??
                      unresolvedAssociationPresentation?.summary}
                  </p>
                </div>
              </div>

              {activeState.chatAssociation.status !== "none" &&
              associationPresentation?.showMeta &&
              activeState.chatAssociation.reason ? (
                <p className={styles.metaText}>
                  {activeState.chatAssociation.reason}
                </p>
              ) : null}
              {activeState.chatAssociation.status === "none" &&
              unresolvedAssociationPresentation?.detail ? (
                <p className={styles.metaText}>
                  {unresolvedAssociationPresentation.detail}
                </p>
              ) : null}
              {activeState.lastReconciliation &&
              activeState.lastReconciliation.archivedCount > 0 ? (
                <p className={styles.metaText}>
                  Archived {activeState.lastReconciliation.archivedCount} superseded
                  {activeState.lastReconciliation.archivedCount === 1 ? " item" : " items"}
                </p>
              ) : null}

              <div className={styles.cardActions}>
                {activeState.chatAssociation.status === "held" ? (
                  <>
                    <button
                      className={styles.primaryButton}
                      disabled={busy || !activeState.chatAssociation.projectId}
                      onClick={() => void approveHeldChat()}
                    >
                      {associationAction === "approving_held"
                        ? "Approving…"
                        : "Approve save"}
                    </button>
                    <button
                      className={styles.secondaryButton}
                      disabled={busy}
                      onClick={() => void dismissHeldChat()}
                    >
                      Ignore chat
                    </button>
                  </>
                ) : null}
                {activeState.chatAssociation.status === "saved" ? (
                  <button
                    className={styles.secondaryButton}
                    disabled={busy}
                    onClick={() => void updateChatAssociation(true)}
                  >
                    Detach chat
                  </button>
                ) : null}
                {activeState.chatAssociation.status === "archived" ? (
                  <button
                    className={styles.secondaryButton}
                    disabled={busy}
                    onClick={() => void updateChatAssociation(false)}
                  >
                    Restore chat
                  </button>
                ) : null}
                {activeState.chatAssociation.status === "ignored" ? (
                  <button
                    className={styles.primaryButton}
                    disabled={
                      busy || !activeState.projectId || !activeState.page.supported
                    }
                    onClick={() => void associateCurrentChat()}
                  >
                    Link & save
                  </button>
                ) : null}
                {activeState.chatAssociation.status === "none" ? (
                  <button
                    className={styles.primaryButton}
                    disabled={
                      busy || !activeState.projectId || !activeState.page.supported
                    }
                    onClick={() => void associateCurrentChat()}
                  >
                    Link & save
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className={styles.panel}>
            <div>
              <h2 className={styles.sectionTitle}>Project context</h2>
              <p className={styles.copy}>
                Quick edits here change the same carry-forward state the dashboard uses.
              </p>
            </div>

            {/* ─── Subtabs ─── */}
            <div className={styles.contextTabs}>
              {(["all", "decisions", "tasks", "constraints"] as const).map(
                (tab) => {
                  const count =
                    tab === "all"
                      ? contextSections.reduce(
                          (n, s) => n + activeState.contextPreview[s].length,
                          0,
                        )
                      : activeState.contextPreview[tab].length;
                  return (
                    <button
                      key={tab}
                      type="button"
                      className={`${styles.contextTab} ${activeContextTab === tab ? styles.contextTabActive : ""}`}
                      onClick={() => setActiveContextTab(tab)}
                    >
                      {tab === "all" ? "All" : sectionLabels[tab]}
                      <span className={styles.contextTabCount}>{count}</span>
                    </button>
                  );
                },
              )}
            </div>

            {/* ─── Tab content ─── */}
            {activeContextTab === "all" ? (
              /* All tab: 3-card layout + notes row */
              <>
              <div className={styles.contextStack}>
                {contextSections.map((section) => {
                  const items = activeState.contextPreview[section];
                  const expanded = expandedSections[section];
                  const visibleItems = expanded ? items.slice(0, 5) : items.slice(0, 1);

                  return (
                    <div key={section} className={`${styles.contextSection} ${styles[sectionColorClass[section]]}`}>
                      <div className={styles.contextSectionHeader}>
                        <span className={styles.contextLabel}>{sectionLabels[section]}</span>
                        <button
                          className={styles.ghostButton}
                          type="button"
                          onClick={() =>
                            setExpandedSections((current) => ({
                              ...current,
                              [section]: !current[section],
                            }))
                          }
                        >
                          {expanded ? "Collapse" : items.length > 1 ? "Expand" : "Add"}
                        </button>
                      </div>

                      {visibleItems.length === 0 ? (
                        <p className={styles.emptyHint}>Nothing saved yet.</p>
                      ) : (
                        visibleItems.map((item) => (
                          <div key={item.key} className={styles.contextItem}>
                            {editingKey === item.key ? (
                              <>
                                <textarea
                                  className={styles.contextEditor}
                                  value={editingText}
                                  onChange={(event) => setEditingText(event.target.value)}
                                />
                                <div className={styles.contextActions}>
                                  <button
                                    className={styles.secondaryButton}
                                    disabled={busy || !editingText.trim()}
                                    onClick={() => void saveEdit(section, item)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className={styles.ghostButton}
                                    type="button"
                                    onClick={() => {
                                      setEditingKey(null);
                                      setEditingText("");
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className={styles.contextText}>{item.text}</p>
                                <div className={styles.contextActions}>
                                  <button
                                    className={styles.ghostButton}
                                    type="button"
                                    onClick={() => startEdit(item)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className={styles.ghostButton}
                                    type="button"
                                    onClick={() => void removeContextItem(section, item)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      )}

                      {expanded ? (
                        <div className={styles.contextComposer}>
                          <textarea
                            className={styles.contextEditor}
                            value={drafts[section]}
                            placeholder={`Add a ${section.slice(0, -1)} Relay should keep.`}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [section]: event.target.value,
                              }))
                            }
                          />
                          <button
                            className={styles.secondaryButton}
                            disabled={busy || !drafts[section].trim()}
                            onClick={() => void addContext(section)}
                          >
                            Add
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className={`${styles.contextSection} ${styles.contextSectionNotes}`}>
                <div className={styles.contextSectionHeader}>
                  <span className={styles.contextLabel}>Notes</span>
                </div>
                {activeState.contextPreview.notes.length === 0 ? (
                  <p className={styles.emptyHint}>
                    Right-click any text on the web → Save to Relay.
                  </p>
                ) : (
                  activeState.contextPreview.notes.map((note) => (
                    <SidepanelNoteItem
                      key={note.memoryId}
                      note={note}
                      busy={busy}
                      onDelete={() => void removeNote(note.memoryId)}
                    />
                  ))
                )}
              </div>
              </>
            ) : (
              /* Single-section tab: unified list with composer */
              (() => {
                const section = activeContextTab;
                const items = activeState.contextPreview[section];

                return (
                  <div className={styles.contextItemList}>
                    {items.length === 0 ? (
                      <p className={styles.emptyHint}>
                        No {sectionLabels[section].toLowerCase()} yet.
                      </p>
                    ) : (
                      items.map((item) => (
                        <div key={item.key} className={styles.contextItemUnified}>
                          {editingKey === item.key ? (
                            <>
                              <textarea
                                className={styles.contextEditor}
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                              />
                              <div className={styles.contextActions} style={{ opacity: 1 }}>
                                <button
                                  className={styles.secondaryButton}
                                  disabled={busy || !editingText.trim()}
                                  onClick={() => void saveEdit(section, item)}
                                >
                                  Save
                                </button>
                                <button
                                  className={styles.ghostButton}
                                  type="button"
                                  onClick={() => {
                                    setEditingKey(null);
                                    setEditingText("");
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className={styles.contextText}>{item.text}</p>
                              <div className={styles.contextActions}>
                                <button
                                  className={styles.ghostButton}
                                  type="button"
                                  onClick={() => startEdit(item)}
                                >
                                  Edit
                                </button>
                                <button
                                  className={styles.ghostButton}
                                  type="button"
                                  onClick={() => void removeContextItem(section, item)}
                                >
                                  Remove
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}

                    {/* Composer always visible in single-section tab */}
                    <div className={styles.contextComposer}>
                      <textarea
                        className={styles.contextEditor}
                        value={drafts[section]}
                        placeholder={`Add a ${section.slice(0, -1)} Relay should keep.`}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [section]: event.target.value,
                          }))
                        }
                      />
                      <button
                        className={styles.secondaryButton}
                        disabled={busy || !drafts[section].trim()}
                        onClick={() => void addContext(section)}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
          </section>

        </>
      )}

      {/* Feedback — only show when signed in and not in a transient loading state */}
      {session?.connected && activeState.viewState !== "connected-loading" ? (
        <div className={styles.feedbackRow}>
          <a
            href="https://relay.featurebase.app"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.feedbackLink}
          >
            Feedback
          </a>
        </div>
      ) : null}

      {/* ─── Delete confirmation overlay ─── */}
      {deletingProject ? (
        <div className={styles.deleteOverlay}>
          <div className={styles.deleteOverlayCard}>
            <p className={styles.deleteOverlayTitle}>Delete project?</p>
            <p className={styles.deleteOverlayDesc}>
              Type <strong>Delete {deletingProject.name}</strong> to confirm. This cannot be undone.
            </p>
            <input
              className={styles.deleteOverlayInput}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={`Delete ${deletingProject.name}`}
              autoFocus
            />
            <div className={styles.deleteOverlayActions}>
              <button
                className={styles.deleteOverlayConfirmBtn}
                disabled={deleteConfirmText !== `Delete ${deletingProject.name}` || busy}
                onClick={() => void deleteProject()}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
              <button
                className={styles.deleteOverlayCancelBtn}
                disabled={busy}
                onClick={() => { setDeletingProject(null); setDeleteConfirmText(""); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showWalkthrough ? (
        <WalkthroughModal
          onDismiss={() => {
            setShowWalkthrough(false);
            void patchUserSettings({
              walkthrough: {
                dismissedAt: new Date().toISOString(),
                completedVia: "extension",
              },
            });
          }}
        />
      ) : null}
    </div>
  );
}

function formatNoteRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

interface SidepanelNoteItemProps {
  note: RelayActiveProjectState["contextPreview"]["notes"][number];
  busy: boolean;
  onDelete: () => void;
}

function SidepanelNoteItem({ note, busy, onDelete }: SidepanelNoteItemProps) {
  const favicon = note.hostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(note.hostname)}&sz=32`
    : null;

  return (
    <article className={styles.noteItem}>
      <p className={styles.noteText}>{note.text}</p>
      <footer className={styles.noteFooter}>
        {note.sourceUrl && note.hostname ? (
          <a
            href={note.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.noteSourceChip}
            onClick={(event) => event.stopPropagation()}
          >
            {favicon ? (
              <img src={favicon} alt="" width={12} height={12} />
            ) : null}
            <span className={styles.noteHostname}>{note.hostname}</span>
          </a>
        ) : null}
        <time className={styles.noteTime} dateTime={note.capturedAt}>
          {formatNoteRelativeTime(note.capturedAt)}
        </time>
        <button
          type="button"
          className={styles.noteDelete}
          disabled={busy}
          onClick={onDelete}
          aria-label="Delete note"
        >
          Remove
        </button>
      </footer>
    </article>
  );
}
