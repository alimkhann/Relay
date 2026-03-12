import { useEffect, useRef, useState } from "react";

import { slugify } from "@relay/shared";

import type { RelayActiveProjectState } from "../messaging/contracts";
import { getActiveTab } from "../utils/browser";
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
import styles from "./control-panel.module.css";

interface ControlPanelProps {
  compact?: boolean;
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
  const [newProjectName, setNewProjectName] = useState("");
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
            assumedProjectId: nextState.projectId ?? "",
            assumedProjectName: nextState.projectName ?? "",
            trust: nextState.trust,
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
    setBusy(true);

    try {
      await chrome.runtime.sendMessage({
        type: "RELAY_SET_ACTIVE_PROJECT",
        payload: {
          projectId: nextProjectId,
          tabId: tab?.id,
        },
      });
      await setRelaySession({
        projectId: nextProjectId,
      });
      setStatus("Project switched.");
      setProjectSwitcherOpen(false);
      await refreshLocalSession();
      await refreshActiveProjectState();
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Project switch failed.",
      );
    } finally {
      setBusy(false);
    }
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
  const selectedProjectId = activeState.projectId ?? session?.projectId ?? "";
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
        <span className={styles.wordmark}>Relay</span>
        {activeState.page.supported ? (
          <span className={styles.pageBadge}>
            {activeState.page.platform}
            {activeState.page.isFreshChat ? " · new chat" : ""}
          </span>
        ) : null}
      </header>

      {!session?.connected ? (
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
      ) : activeState.projectOptions.length === 0 && !activeState.projectId ? (
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
      ) : (
        <>
          {/* ─── Project + Status ─── */}
          <section className={styles.panel}>
            <div style={{ position: "relative" }}>
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

            <div className={styles.statusRow}>
              <span
                className={`${styles.dot} ${activeState.canInsert ? styles.dotReady : styles.dotWaiting}`}
              />
              <span className={styles.statusText}>{activeState.message}</span>
            </div>

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
