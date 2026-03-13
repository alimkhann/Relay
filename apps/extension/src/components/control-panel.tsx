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
  createExtensionFlowId,
  logExtensionEvent,
} from "../utils/telemetry";
import {
  inferTargetProfile,
  resolveTargetProfile,
} from "../utils/target-profile";
import relayIconUrl from "../../assets/icon.png";
import styles from "./control-panel.module.css";

interface ControlPanelProps {
  compact?: boolean;
}

type ContextSection = "decisions" | "constraints" | "tasks";
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

const emptyActiveState: RelayActiveProjectState = {
  projectId: null,
  projectName: null,
  projectOptions: [],
  viewState: "unsupported",
  showCue: true,
  status: "unavailable",
  message: "Open ChatGPT, Claude, Codex, or Perplexity to use Relay.",
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

export function ControlPanel({ compact = false }: ControlPanelProps) {
  const [session, setSession] = useState<RelaySessionState | null>(null);
  const [activeState, setActiveState] =
    useState<RelayActiveProjectState>(emptyActiveState);
  const [status, setStatus] = useState("Relay stays quiet until it is useful.");
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [associationAction, setAssociationAction] = useState<
    null | "approving_held"
  >(null);
  const [newProjectName, setNewProjectName] = useState("");
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
  const activeStateRequestInFlight = useRef(false);

  useEffect(() => {
    void (async () => {
      setDeviceName(defaultDeviceName());
      await refreshLocalSession();
      await refreshActiveProjectState();
    })();
  }, []);

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

  async function openConnectFlow() {
    setBusy(true);
    setStatus("Opening Relay pairing…");

    try {
      await chrome.runtime.sendMessage({
        type: "RELAY_OPEN_CONNECT",
        payload: {
          deviceName: deviceName || defaultDeviceName(),
        },
      });
      setStatus("Finish pairing in the Relay tab, then return here.");
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Failed to open pairing flow.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    console.log("[Relay] signInWithGoogle called");
    setBusy(true);
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
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;

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
        payload: { name, slug, flowId },
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
        payload: { tabId: tab.id },
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
                  ? `Relay will save this chat to ${nextProject.name} in 20 seconds unless you cancel.`
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

  const resolvedTargetProfileKey = resolveTargetProfile({
    platform: activeState.page.platform,
    targetMode: session?.targetMode,
    manualTargetProfileKey: session?.targetProfileKey,
  });
  const resolvedTargetLabel = {
    chatgpt_planning: "ChatGPT Planning",
    claude_code_build: "Claude Build",
    codex_implementation: "Codex Build",
    perplexity_research: "Perplexity Research",
  }[resolvedTargetProfileKey];
  const selectedProjectId =
    activeState.projectId ??
    session?.projectId ??
    session?.assumedProjectId ??
    "";
  const dashboardHref =
    session?.apiBase && selectedProjectId
      ? `${session.apiBase}/dashboard?project=${encodeURIComponent(selectedProjectId)}`
      : session?.apiBase
        ? `${session.apiBase}/dashboard`
        : "#";
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

  return (
    <div
      className={`${styles.shell} ${compact ? styles.compact : styles.expanded}`}
    >
      {/* ─── Header ─── */}
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <img
            className={styles.logoMark}
            src={relayIconUrl}
            alt="Relay"
          />
          <a
            className={styles.inlineLink}
            href={dashboardHref}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11 }}
          >
            Dashboard
          </a>
        </div>
        {activeState.page.supported ? (
          <span className={styles.pageBadge}>
            {activeState.page.platform}
            {activeState.page.isFreshChat ? " · new chat" : ""}
          </span>
        ) : null}
      </header>

      {activeState.viewState === "disconnected" || !session?.connected ? (
        /* ─── Connect state ─── */
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Sign in to Relay</h2>
          <p className={styles.copy}>
            Sign in once. Relay captures useful work quietly and keeps your next
            chat ready.
          </p>

          <button
            className={styles.primaryButton}
            disabled={busy}
            onClick={() => void signInWithGoogle()}
          >
            {busy ? "Signing in…" : "Sign in with Google"}
          </button>

          <div className={styles.dividerRow}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerLabel}>or</span>
            <span className={styles.dividerLine} />
          </div>

          <button
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => void openConnectFlow()}
          >
            Pair via web
          </button>
        </section>
      ) : activeState.viewState === "connected-empty" ? (
        /* ─── No projects yet ─── */
        <>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Create your first project</h2>
            <p className={styles.copy}>
              Projects group your chats and context. Name it after what you are
              working on.
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

            <button
              className={styles.primaryButton}
              disabled={busy || !newProjectName.trim()}
              onClick={() => void createProject()}
            >
              {busy ? "Creating…" : "Create project"}
            </button>
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
              disabled={busy || !activeState.canInsert}
              onClick={() => void insertProjectBrief()}
            >
              {busy ? (
                <span className={styles.shimmerText}>Inserting…</span>
              ) : (
                "Insert project brief"
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
          </section>

          {activeState.chatAssociation.status !== "none" ? (
            <section className={styles.panel}>
              <div className={styles.associationHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Chat association</h2>
                  <p className={styles.copy}>
                    {activeState.chatAssociation.status === "pending"
                      ? `Relay is ready to save this chat to ${activeState.chatAssociation.projectName ?? "the selected project"} unless you cancel the toast.`
                      : activeState.chatAssociation.status === "held"
                      ? activeState.chatAssociation.reason?.includes(
                          "seeding its first chat context",
                        )
                        ? `Relay is treating this as the first chat for ${activeState.chatAssociation.projectName ?? "this project"} and is waiting for your approval.`
                        : `Relay thinks this chat belongs to ${activeState.chatAssociation.projectName ?? "this project"}, but it is waiting for your approval.`
                      : activeState.chatAssociation.status === "saved"
                        ? `This chat is currently associated with ${activeState.chatAssociation.projectName ?? "the selected project"}.`
                        : activeState.chatAssociation.status === "archived"
                          ? "This chat was detached from the project. You can restore it if Relay should use it again."
                          : activeState.chatAssociation.reason ?? "Relay is leaving this chat out of automatic capture."}
                  </p>
                </div>
              </div>

              {activeState.chatAssociation.reason ? (
                <p className={styles.metaText}>
                  {activeState.chatAssociation.reason}
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
                          Add {sectionLabels[section].slice(0, -1)}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─── Debug ─── */}
          <details
            className={styles.debugPanel}
            open={advancedOpen}
            onToggle={(event) =>
              setAdvancedOpen((event.target as HTMLDetailsElement).open)
            }
          >
            <summary className={styles.summary}>Debug</summary>

            <label className={styles.field}>
              <span>Target override</span>
              <select
                value={
                  session?.targetMode === "manual"
                    ? session.targetProfileKey
                    : ""
                }
                onChange={async (event) => {
                  const nextTarget = event.target.value;
                  await setRelaySession({
                    targetMode: nextTarget ? "manual" : "auto",
                    targetProfileKey: nextTarget,
                    resolvedTargetProfileKey:
                      nextTarget ||
                      inferTargetProfile(activeState.page.platform),
                  });
                  await refreshLocalSession();
                }}
              >
                <option value="">Automatic</option>
                <option value="chatgpt_planning">ChatGPT planning</option>
                <option value="claude_code_build">Claude build</option>
                <option value="codex_implementation">Codex build</option>
                <option value="perplexity_research">Perplexity research</option>
              </select>
            </label>

            <div className={styles.advancedButtons}>
              <button
                className={styles.secondaryButton}
                disabled={
                  busy || !activeState.projectId || !activeState.page.supported
                }
                onClick={() => void captureNow()}
              >
                Capture now
              </button>
              <button
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => void refreshRemoteSession()}
              >
                Refresh session
              </button>
            </div>

            <div className={styles.debugCard}>
              <p>{status}</p>
              <p>Remote: {activeState.remoteStatus}</p>
              <p>
                Target: {session?.targetMode === "manual" ? "Manual" : "Auto"} ·{" "}
                {resolvedTargetLabel}
              </p>
              <p>Shortcut: {activeState.shortcutLabel}</p>
              {activeState.issue ? (
                <p>Issue: {activeState.issue.detail}</p>
              ) : null}
              {activeState.lastSuccessfulSyncAt ? (
                <p>
                  Last sync:{" "}
                  {new Date(
                    activeState.lastSuccessfulSyncAt,
                  ).toLocaleTimeString()}
                </p>
              ) : null}
              {session?.limitedMode ? (
                <p>Fallback: saved context only</p>
              ) : null}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
