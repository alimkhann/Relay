import { useEffect, useRef, useState } from "react";

import { slugify } from "@relay/shared/utils/text";

import type { RelayActiveProjectState } from "../messaging/contracts";
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
import {
  createExtensionFlowId,
  logExtensionEvent,
} from "../utils/telemetry";
import relayIconUrl from "../../assets/icon.png";
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
  shortcutLabel: "Mod+Shift+I",
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
  const [status, setStatus] = useState("Relay stays quiet until it is useful.");
  const [busy, setBusy] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [associationAction, setAssociationAction] = useState<
    null | "approving_held"
  >(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [localAuthEmail, setLocalAuthEmail] = useState("");
  const [localAuthName, setLocalAuthName] = useState("");
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
  const activeStateRequestInFlight = useRef(false);

  function applyResolvedTheme(nextResolvedTheme: RelayResolvedTheme) {
    document.documentElement.dataset.relayTheme = nextResolvedTheme;
    document.body.dataset.relayTheme = nextResolvedTheme;
    setResolvedTheme(nextResolvedTheme);
  }

  useEffect(() => {
    void (async () => {
      setDeviceName(defaultDeviceName());
      const nextThemeMode = await getRelayThemeMode();
      setThemeMode(nextThemeMode);
      applyResolvedTheme(resolveRelayThemeMode(nextThemeMode));
      await refreshLocalSession();
      await refreshActiveProjectState();
    })();
  }, []);

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

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const description = newProjectDescription.trim();

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
        payload: { name, slug, description: description || null, flowId },
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
      setNewProjectName("");
      setNewProjectDescription("");
      setStatus(`Created project "${result.project?.name}".`);
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

  async function saveToProject() {
    const tab = await getActiveTab();
    if (!tab?.id || !activeState.page.supported) {
      setStatus("Save to project works only on a supported AI tab.");
      return;
    }

    if (!activeState.projectId) {
      setStatus("Choose a project first.");
      return;
    }

    setBusy(true);
    setStatus("Saving selected text…");

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_PIN_SELECTION",
        payload: {
          projectId: activeState.projectId,
          tabId: tab.id,
        },
      })) as { ok?: boolean; reason?: string };

      setStatus(
        result?.ok
          ? "Saved to project."
          : (result?.reason ?? "Save to project failed."),
      );
      if (result?.ok) {
        await refreshActiveProjectState();
      }
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Save to project failed.",
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
        <div className={styles.headerBrand}>
          <button
            type="button"
            className={styles.logoLink}
            aria-label="Open dashboard"
            title="Open dashboard"
            onClick={() => void openDashboard(dashboardPath)}
          >
            <img
              className={styles.logoMark}
              src={relayIconUrl}
              alt="Relay"
            />
          </button>
        </div>
        {activeState.page.supported ? (
          <span className={styles.pageBadge}>
            {activeState.page.platform}
            {activeState.page.isFreshChat ? " · new chat" : ""}
          </span>
        ) : null}
        <div className={styles.headerActions}>
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
            <span className={styles.settingsLabel}>Account</span>
            <p className={styles.settingsHint}>
              Manage projects, platforms, billing and profile in the dashboard.
            </p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void openDashboard("/settings")}
            >
              Open dashboard settings
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={signOutBusy}
              onClick={() => void handleSignOut()}
            >
              {signOutBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>

          <p className={styles.settingsVersion}>Relay · v0.1.1</p>
        </section>
      ) : authenticating ? (
        <section className={styles.panel}>
          <p className={styles.copy}>Signing in…</p>
        </section>
      ) : activeState.viewState === "disconnected" || !session?.connected ? (
        /* ─── Connect state ─── */
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Sign in to Relay</h2>
          <p className={styles.copy}>
            Sign in once. Relay captures useful work quietly and keeps your next
            chat ready.
          </p>

          {extensionAuthProvider === "local" ? (
            <>
              <label className={styles.field}>
                <span>Email</span>
                <input
                  value={localAuthEmail}
                  onChange={(event) => setLocalAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                />
              </label>

              <label className={styles.field}>
                <span>Name</span>
                <input
                  value={localAuthName}
                  onChange={(event) => setLocalAuthName(event.target.value)}
                  placeholder="Display name (optional)"
                />
              </label>

              <button
                className={styles.primaryButton}
                disabled={busy || !localAuthEmail.trim()}
                onClick={() => void signInLocally()}
              >
                {busy ? "Signing in…" : "Sign in locally"}
              </button>
            </>
          ) : (
            <button
              className={styles.primaryButton}
              disabled={busy}
              onClick={() => void signInWithGoogle()}
            >
              {busy ? "Signing in…" : "Sign in with Google"}
            </button>
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
      ) : activeState.viewState === "unsupported" ? (
        <section className={styles.panel}>
          <div>
            <h2 className={styles.sectionTitle}>Open a supported AI chat</h2>
            <p className={styles.copy}>
              Relay is ready, but this tab is not one of the supported chat
              surfaces yet.
            </p>
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
                  onClick={() =>
                    activeState.projectOptions.length > 1 &&
                    setProjectSwitcherOpen((v) => !v)
                  }
                >
                  <h2 className={styles.projectName}>
                    {activeState.projectName ?? "No project"}
                  </h2>
                  {activeState.entitlements?.isPro ? (
                    <span className={styles.proChip} aria-label="Pro plan">
                      Pro
                    </span>
                  ) : null}
                  {activeState.projectOptions.length > 1 ? (
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
                  ) : null}
                </div>

                {projectSwitcherOpen ? (
                  <div className={styles.projectDropdown}>
                    {activeState.projectOptions.map((project) => (
                      <button
                        key={project.id}
                        className={`${styles.projectOption} ${project.id === selectedProjectId ? styles.projectOptionActive : ""}`}
                        onClick={() => void handleProjectChange(project.id)}
                      >
                        {project.id === selectedProjectId ? "✓ " : ""}
                        {project.name}
                      </button>
                    ))}
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
              {busy || insertButtonState.shimmering ? (
                <span className={styles.shimmerText}>Inserting…</span>
              ) : (
                insertButtonState.label
              )}
            </button>

            {/* Secondary action */}
            <button
              className={styles.secondaryButton}
              style={{ marginTop: 8 }}
              disabled={
                busy || !activeState.projectId || !activeState.page.supported
              }
              onClick={() => void saveToProject()}
            >
              Save to project
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
                    AI analyses used up today — resets at midnight UTC
                    {activeState.lastBudgetStatus.plan === "free" && !activeState.entitlements?.isPro ? (
                      <>
                        {" · "}
                        <a
                          href="https://www.onrelay.app/pricing"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.upgradeLink}
                        >
                          Upgrade for 32/project · 120/day
                        </a>
                      </>
                    ) : null}
                  </span>
                ) : (
                  <span>
                    ⚡ {activeState.lastBudgetStatus.aiRemaining}/
                    {activeState.lastBudgetStatus.aiLimit} analyses today
                    {activeState.lastBudgetStatus.plan === "free" && !activeState.entitlements?.isPro ? (
                      <>
                        {" · "}
                        <a
                          href="https://www.onrelay.app/pricing"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.upgradeLink}
                        >
                          Upgrade
                        </a>
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
                    Associate chat
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
                    Associate chat
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
              /* All tab: show 3-card layout (original view) */
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
    </div>
  );
}
