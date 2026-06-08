import { effectiveAutoCapture } from "@relay/shared/utils/capture-settings";
import { createFlowId } from "@relay/shared/utils/telemetry";
import type { SupportedPlatform } from "@relay/shared";

import type { RelayPageState } from "../messaging/contracts";
import { clearIgnoredChatKey, isIgnoredChatKey, readApprovedAssociations, rememberApprovedAssociation } from "../storage/routing";
import { getRelaySession, setRelaySession } from "../storage/session";
import { persistTabSignature } from "../storage/capture-signatures";
import { resolveTargetProfile } from "../utils/target-profile";
import { relayFetch } from "../utils/api";
import { buildDoneToast, getSavingToastMinimumDelayMs, resolveAssociationProjectName } from "./association-workflow";
import { getRetargetableAssociationProject, hydrateTabStateFromSession, reconcileManualOverride, setEffectiveProjectTarget } from "./association";
import { captureTab } from "./capture-api";
import { RETRY_DRAIN_DELAY_MS, scheduleDrain } from "./drain-scheduler";
import { AUTO_CAPTURE_GRACE_MS, wait } from "./bg-utils";
import { buildAssociationKey, findApprovedAssociationMatch, hasPersonalProfileIntent } from "./routing";
import { invalidateProjectCache } from "./session-cache";
import { tabStates } from "./state";
import { clearAssociationToast, clearCaptureTimer, clearPendingAssociation, clearPendingInsertedBrief, getOrCreateTabState } from "./tab-state-store";
import { shouldScheduleAutoCapture } from "./tab-state";
import { captureObservedChange as _self } from "./capture-controller";
import { logRoutingDecision, resolveAutoCaptureRouting, restoreApprovedAssociationState, showAskToast, showAssociationToast, showSavingToast } from "./association-controller";
import { recordBackgroundTelemetry } from "./telemetry";

let captureDeps: {
  broadcastActiveProjectState(tabId: number): Promise<void>;
  rememberProjectSelection(projectId: string, tabId: number | null, pageState: RelayPageState, projectName?: string | null): Promise<void>;
  requestPageStateFromTab(tabId: number): Promise<RelayPageState>;
  syncTabRemoteState(tabId: number, options?: { force?: boolean; reason?: string }): Promise<void>;
};

export function configureCaptureController(deps: typeof captureDeps) {
  captureDeps = deps;
}

export async function captureObservedChange(
  tabId: number,
  explicitProjectId?: string,
  options: {
    manualSelection?: boolean;
    skipAssociationToast?: boolean;
    autoCapture?: boolean;
    // Multi-project capture: link the captured session to these extra projects
    // (incl. personal) so each runs its own digest. Membership is re-checked
    // server-side.
    additionalProjectIds?: string[];
  } = {},
) {
  const state = getOrCreateTabState(tabId);
  // Race guard: claim the tab synchronously before any await so a second
  // captureObservedChange arriving mid-flight (e.g. from the DOM observer
  // firing while a manual selection is still running) short-circuits
  // instead of mutating shared tab state concurrently.
  if (state.capturePending && state.capturePendingAt && (Date.now() - state.capturePendingAt) < 3 * 60 * 1000) {
    return { ok: false, reason: "Capture already in progress for this tab." };
  }
  state.capturePending = true;
  state.capturePendingAt = Date.now();
  const flowId = createFlowId("ext-capture");
  let session = await getRelaySession();
  hydrateTabStateFromSession(state, session);
  const chatKey = buildAssociationKey(state.page);
  const manualSelection = Boolean(options.manualSelection);
  const skipAssociationToast = Boolean(options.skipAssociationToast);
  const autoCapture = Boolean(options.autoCapture);
  const previousAssociationProjectName = state.chatAssociation.projectName;
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "capture",
    event: "capture_started",
    flowId,
    message: "Started extension capture orchestration.",
    projectId: explicitProjectId ?? state.projectId ?? null,
    tabId,
    context: {
      trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
      chatProvider: state.page.platform ?? null,
      captureSignature: state.page.captureSignature ?? null,
      turnCount: state.page.turns ?? 0,
      sourceUrl: state.page.url ?? null,
    },
  });
  console.warn("[Relay BG] captureObservedChange start", {
    tabId,
    explicitProjectId: explicitProjectId ?? null,
    autoCapture,
    manualSelection,
    skipAssociationToast,
    turns: state.page.turns ?? 0,
    signature: state.page.captureSignature ?? null,
    stable: state.page.isStable,
    streaming: state.page.isStreaming,
    remoteStatus: state.remoteStatus,
  });
  await captureDeps.broadcastActiveProjectState(tabId);

  try {
    if (autoCapture) {
      await wait(AUTO_CAPTURE_GRACE_MS);
      await captureDeps.requestPageStateFromTab(tabId);

      const latestState = getOrCreateTabState(tabId);
      const stillEligible = shouldScheduleAutoCapture({
        page: latestState.page,
        capturePending: false,
        lastCapturedSignature: latestState.lastCapturedSignature,
        lastCapturedTurns: latestState.lastCapturedTurns,
      });

      console.warn("[Relay BG] auto-capture recheck", {
        tabId,
        eligible: stillEligible,
        turns: latestState.page.turns ?? 0,
        signature: latestState.page.captureSignature ?? null,
        stable: latestState.page.isStable,
        streaming: latestState.page.isStreaming,
      });

      if (!stillEligible) {
        recordBackgroundTelemetry({
          level: "info",
          surface: "extension-background",
          area: "capture",
          event: "capture_skipped",
          flowId,
          message: "Skipped extension capture while waiting for the chat to settle.",
          projectId: explicitProjectId ?? state.projectId ?? null,
          tabId,
          context: {
            trigger: "auto",
            reason: "waiting_for_settle",
            captureSignature: latestState.page.captureSignature ?? null,
            turnCount: latestState.page.turns ?? 0,
          },
        });
        return {
          ok: true,
          deferred: true,
          captured: false,
          reason: "Auto-capture is waiting for the chat to settle.",
        };
      }
    }

    // A manual project switch on this chat must win over the chat's
    // auto-derived association when routing a non-explicit save, so the save
    // lands where the user pointed Relay. Reconcile first to drop a stale
    // override left over from a different conversation. Computed up here (before
    // the personal guard) so the guard checks the SAME target the capture will
    // use, not a stale state.projectId.
    if (!explicitProjectId) {
      await reconcileManualOverride(state);
    }
    const manualOverrideProjectId =
      !explicitProjectId && state.manualProjectId ? state.manualProjectId : null;

    // Auto-capture resolves most-specific-wins across (project × platform):
    // a per-platform leaf overrides the project-level value, which overrides
    // the global setting (incl. the personal project). Resolve against the
    // override-folded target, not raw state.projectId — otherwise a
    // worker-restart with a stale state.projectId lets the personal guard below
    // check the wrong project and auto-capture a full session into Personal.
    const effectiveActiveProjectId =
      manualOverrideProjectId ?? explicitProjectId ?? state.projectId ?? session.projectId ?? null;
    const activeProjectOption = effectiveActiveProjectId
      ? session.projectOptions.find((option) => option.id === effectiveActiveProjectId)
      : undefined;

    // Personal capture is salience-safe server-side: when the origin project is
    // personal, the server skips the project digest and runs the salience
    // classifier (durable user facts only, never decisions/constraints/tasks).
    // And personal is NEVER auto-selected (loadSessionData excludes it), so the
    // active project is personal ONLY because the user deliberately parked on it
    // — via an explicit pick, a manual override on this chat, or a manual save.
    // In all those cases auto-capture/held→continue into Personal is exactly the
    // intended personal-memory UX, so allow it. We only block the impossible
    // "accidentally landed on personal with no deliberate signal" case.
    const personalIsDeliberate =
      Boolean(manualSelection) ||
      Boolean(explicitProjectId) ||
      Boolean(manualOverrideProjectId);
    if (activeProjectOption?.kind === "personal" && !personalIsDeliberate) {
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "capture",
        event: "capture_skipped",
        flowId,
        message: "Skipped auto-capture into the personal project (not deliberately selected).",
        projectId: effectiveActiveProjectId,
        tabId,
        context: {
          trigger: autoCapture ? "auto" : "association",
          reason: "personal_auto_capture_blocked",
        },
      });
      return {
        ok: false,
        reason: "Auto-capture does not target your personal project.",
      };
    }

    const autoCaptureAllowed = effectiveAutoCapture({
      platform: (state.page.platform ?? null) as SupportedPlatform | null,
      global: session.autoCapture,
      project: activeProjectOption?.autoCapture,
      projectPlatforms: activeProjectOption?.autoCapturePlatforms,
    });

    if (!session.connected || !session.token || (!explicitProjectId && !autoCaptureAllowed)) {
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "capture",
        event: "capture_skipped",
        flowId,
        message: "Skipped extension capture because session or auto-capture was not ready.",
        projectId: explicitProjectId ?? state.projectId ?? null,
        tabId,
        context: {
          trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
          reason: "capture_not_ready",
        },
      });
      return { ok: false, reason: "Auto-capture is not ready." };
    }

    if (!state.projectId && !explicitProjectId) {
      await captureDeps.syncTabRemoteState(tabId, {
        force: true,
        reason: "capture_needs_project",
      });
    }

    // manualOverrideProjectId was resolved above (before the personal guard).
    let projectId = manualOverrideProjectId ?? explicitProjectId ?? state.projectId;
    let routingDecision: Awaited<ReturnType<typeof resolveAutoCaptureRouting>> | null =
      null;
    let autoAssociated = false;
    let savingToastShownAt: number | null = null;
    const ignoredFromMemory = explicitProjectId
      ? false
      : await isIgnoredChatKey(chatKey);
    const approvedAssociations = explicitProjectId
      ? []
      : await readApprovedAssociations();
    const exactApprovedAssociation = explicitProjectId
      ? null
      : findApprovedAssociationMatch(state.page, approvedAssociations);

    if (!explicitProjectId && !manualOverrideProjectId) {
      if (
        state.chatAssociation.status === "saved" &&
        state.chatAssociation.projectId
      ) {
        projectId = state.chatAssociation.projectId;
        state.associationSuppressed = false;
        state.routingReview = {
          confidence: "high",
          score: 100,
          reasons: ["This chat is already associated with the project."],
        };
        clearPendingAssociation(state);
        clearAssociationToast(state);
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;

        const signatureChanged =
          state.page.captureSignature &&
          state.page.captureSignature !== state.lastCapturedSignature;

        if (!signatureChanged) {
          return {
            ok: true,
            restored: true,
            captured: false,
            projectId,
            sessionId: state.chatAssociation.sessionId ?? null,
            reason: "This chat is already associated with the project.",
          };
        }

        // Signature changed — fall through to re-capture with the saved project
        autoAssociated = true;
      } else if (state.chatAssociation.status === "archived") {
        clearPendingAssociation(state, { clearChatAssociation: false });
        clearAssociationToast(state);
        state.associationSuppressed = true;
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
        state.routingReview = {
          confidence: "low",
          score: 0,
          reasons: ["This chat was detached from the project and will stay out of auto-capture."],
        };
        return {
          ok: true,
          ignored: true,
          captured: false,
          reason: "This chat was detached from the project.",
        };
      } else if (state.chatAssociation.status === "ignored") {
        clearPendingAssociation(state, { clearChatAssociation: false });
        clearAssociationToast(state);
        state.associationSuppressed = true;
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
        state.routingReview = {
          confidence: "low",
          score: 0,
          reasons: ["This chat was already dismissed from automatic capture."],
        };
        return {
          ok: true,
          ignored: true,
          captured: false,
          reason: "This chat was already dismissed from automatic capture.",
        };
      } else if (ignoredFromMemory) {
        clearPendingAssociation(state, { clearChatAssociation: true });
        clearAssociationToast(state);
        state.associationSuppressed = true;
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
        state.chatAssociation = {
          status: "ignored",
          projectId: null,
          projectName: null,
          sessionId: null,
          reason: "Relay will ignore this chat until you manually associate it.",
          capturedAt: null,
        };
        state.routingReview = {
          confidence: "low",
          score: 0,
          reasons: ["This chat was already dismissed from automatic capture."],
        };
        return {
          ok: true,
          ignored: true,
          captured: false,
          reason: "This chat was already dismissed from automatic capture.",
        };
      } else if (exactApprovedAssociation?.projectId) {
        restoreApprovedAssociationState(state, exactApprovedAssociation);
        projectId = exactApprovedAssociation.projectId;
        await clearIgnoredChatKey(chatKey);
        await setEffectiveProjectTarget(
          state,
          exactApprovedAssociation.projectId,
          exactApprovedAssociation.projectName,
        );
        return {
          ok: true,
          restored: true,
          captured: false,
          projectId,
          sessionId: exactApprovedAssociation.sessionId ?? null,
          reason: state.routingReview?.reasons[0] ?? "Matched a previously approved chat.",
        };
      } else {
        if (!state.projectOptions.length && !session.projectOptions.length) {
          await captureDeps.syncTabRemoteState(tabId, {
            force: true,
            reason: "association_needs_projects",
          });
          session = await getRelaySession();
          hydrateTabStateFromSession(state, session);
        }

        if (!state.projectOptions.length && !session.projectOptions.length) {
          state.routingReview = null;
          recordBackgroundTelemetry({
            level: "info",
            surface: "extension-background",
            area: "capture",
            event: "capture_skipped",
            flowId,
            message: "Skipped extension capture because no projects were available yet.",
            tabId,
            context: {
              trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
              reason: "waiting_for_project_routing",
            },
          });
          return {
            ok: true,
            deferred: true,
            captured: false,
            reason: "Waiting for project routing context.",
          };
        }

        routingDecision = await resolveAutoCaptureRouting(
          tabId,
          state,
          approvedAssociations,
        );

        state.routingReview = {
          confidence: routingDecision.confidence,
          score: routingDecision.score,
          reasons: [...routingDecision.reasons],
        };

        if (routingDecision.mode === "ignore") {
          // Personal-profile chats: harvest durable facts into Personal even
          // when ignored for the active project. Fire-and-forget, non-fatal.
          // Uses the visible page text already fetched for routing.
          const harvestContent = state.page.fullVisibleRoutingText ?? state.page.title ?? ""
          const originProjectId = state.projectId
          if (
            originProjectId &&
            harvestContent &&
            hasPersonalProfileIntent(harvestContent)
          ) {
            void relayFetch(`/api/projects/${originProjectId}/memory`, {
              method: "POST",
              body: JSON.stringify({
                content: harvestContent.slice(0, 6000),
                type: "note",
                routingHint: "auto",
                harvestOnly: true,
                sourceSurface: state.page.platform ?? "extension",
              }),
            }).catch(() => {})
          }

          const ignoredReason = routingDecision.reasons[0]
            ? `${routingDecision.reasons[0]} Manually associate this chat if Relay should keep it.`
            : "Relay will ignore this chat until you manually associate it.";
          clearPendingAssociation(state, { clearChatAssociation: true });
          clearAssociationToast(state);
          state.associationSuppressed = false;
          state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
          state.chatAssociation = {
            status: "ignored",
            projectId: null,
            projectName: null,
            sessionId: null,
            reason: ignoredReason,
            capturedAt: null,
          };
          logRoutingDecision("ignored", state, routingDecision);
          recordBackgroundTelemetry({
            level: "info",
            surface: "extension-background",
            area: "capture",
            event: "capture_skipped",
            flowId,
            message: ignoredReason,
            tabId,
            context: {
              trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
              reason: "routing_ignored",
            },
          });
          return {
            ok: true,
            ignored: true,
            captured: false,
            reason: ignoredReason,
          };
        }

        if (
          routingDecision.mode === "hold" &&
          routingDecision.candidateProjectId &&
          routingDecision.candidateProjectName
        ) {
          await clearIgnoredChatKey(chatKey);
          await setEffectiveProjectTarget(
            state,
            routingDecision.candidateProjectId,
            routingDecision.candidateProjectName,
            { persist: false },
          );
          await showAskToast(
            tabId,
            routingDecision.candidateProjectId,
            routingDecision.candidateProjectName,
          );
          recordBackgroundTelemetry({
            level: "info",
            surface: "extension-background",
            area: "capture",
            event: "capture_skipped",
            flowId,
            message: "Held extension capture pending association review.",
            projectId: routingDecision.candidateProjectId,
            tabId,
            context: {
              trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
              reason: "association_review_required",
            },
          });
          return {
            ok: true,
            held: true,
            captured: false,
            projectId: routingDecision.candidateProjectId,
            reason:
              routingDecision.reasons[0] ??
              "Waiting for review before saving this chat.",
          };
        }

        projectId = routingDecision.candidateProjectId ?? projectId;
        autoAssociated = Boolean(projectId);
      }
    }

    if (!projectId) {
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "capture",
        event: "capture_skipped",
        flowId,
        message: "Skipped extension capture because no project was selected.",
        tabId,
        context: {
          trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
          reason: "missing_project",
        },
      });
      return { ok: false, reason: "Choose a project first." };
    }

    // Show the "saving…" toast for EVERY capture that reaches this point —
    // manual save, explicit pick, auto-association, AND a held→continue
    // approval. Previously it was gated on (autoAssociated || explicitProjectId),
    // so held→continue and some auto paths only showed the after-saved toast.
    // We have a resolved projectId here, so any capture should announce itself.
    if (!skipAssociationToast) {
      const projectName = resolveAssociationProjectName({
        matchedProjectName:
          state.projectOptions.find((project) => project.id === projectId)?.name ??
          session.projectOptions.find((project) => project.id === projectId)?.name ??
          null,
        previousAssociationProjectName,
        routingCandidateProjectName: routingDecision?.candidateProjectName ?? null,
        stateProjectName: state.projectName,
        sessionAssumedProjectName: session.assumedProjectName || null,
      });

      if (autoAssociated && !explicitProjectId) {
        await clearIgnoredChatKey(chatKey);
        await setEffectiveProjectTarget(state, projectId, projectName, {
          persist: false,
        });
      }
      // Show the saving toast before capture so users can register what happened.
      await showSavingToast(tabId, projectId, projectName);
      savingToastShownAt = Date.now();
    }

    const result = await captureTab(projectId, tabId, {
      processingMode: explicitProjectId ? "fast_ack" : "default",
      additionalProjectIds: options.additionalProjectIds,
    });
    if (result?.ok) {
      if (savingToastShownAt !== null) {
        const remainingDelay = getSavingToastMinimumDelayMs({
          shownAt: savingToastShownAt,
        });
        if (remainingDelay > 0) {
          await wait(remainingDelay);
        }
      }

      // Removed clearPendingAssociation(state) and clearAssociationToast(state) to prevent flashing the toast between states
      const matchedProject =
        state.projectOptions.find((project) => project.id === projectId) ??
        session.projectOptions.find((project) => project.id === projectId) ??
        null;
      const projectName = resolveAssociationProjectName({
        matchedProjectName: matchedProject?.name ?? null,
        previousAssociationProjectName,
        routingCandidateProjectName: routingDecision?.candidateProjectName ?? null,
        stateProjectName: state.projectName,
        sessionAssumedProjectName: session.assumedProjectName || null,
      });
      const associationProjectName = projectName;

      state.lastCapturedSignature =
        state.page.captureSignature ?? state.lastObservedSignature;
      state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
      state.lastCapturedTurns = state.page.turns ?? state.lastObservedTurns;

      // Persist to chrome.storage.session so dedup survives worker suspension
      await persistTabSignature(tabId, {
        lastCapturedSignature: state.lastCapturedSignature,
        lastCapturedTurns: state.lastCapturedTurns,
        lastRoutedSignature: state.lastRoutedSignature,
        updatedAt: Date.now(),
      });
      state.associationSuppressed = false;
      state.projectId = projectId;
      state.projectName = projectName || state.projectName;
      state.stateStatus = result.stateStatus ?? state.stateStatus;
      state.lastReconciliation = result.reconciliation ?? null;
      state.chatAssociation = {
        status: "saved",
        projectId,
        projectName: associationProjectName,
        sessionId: result.sessionId ?? null,
        reason: "This chat is currently saved to the project.",
        capturedAt: new Date().toISOString(),
      };
      invalidateProjectCache(projectId);
      if (
        state.pendingInsertedBrief &&
        state.pendingInsertedBrief.projectId === projectId
      ) {
        clearPendingInsertedBrief(state);
      }
      await clearIgnoredChatKey(chatKey);
      await setRelaySession({
        assumedProjectId: projectId,
        assumedProjectName: projectName,
        resolvedTargetProfileKey: resolveTargetProfile({
          platform: state.page.platform,
          targetMode: session.targetMode,
          manualTargetProfileKey: session.targetProfileKey,
        }),
        stateStatus: result.stateStatus ?? session.stateStatus,
      });
      if (manualSelection) {
        await captureDeps.rememberProjectSelection(projectId, tabId, state.page, projectName);
      }
      if (result.sessionId) {
        await rememberApprovedAssociation({
          key: chatKey,
          projectId,
          projectName: associationProjectName ?? projectName,
          projectSlug: matchedProject?.slug ?? null,
          platform: (state.page.platform ?? null) as SupportedPlatform | null,
          domain: state.page.domain ?? null,
          pathname: state.page.pathname ?? null,
          pageFingerprint: state.page.pageFingerprint ?? null,
          sourceConversationId: state.page.sourceConversationId ?? null,
          url: state.page.url ?? null,
          title: state.page.title ?? null,
          recentUserTurnText: state.page.recentUserTurnText ?? null,
          sessionId: result.sessionId,
          approvedAt: new Date().toISOString(),
        });
      } else if (result.skippedInsertedContext) {
        await rememberApprovedAssociation({
          key: chatKey,
          projectId,
          projectName: associationProjectName ?? projectName,
          projectSlug: matchedProject?.slug ?? null,
          platform: (state.page.platform ?? null) as SupportedPlatform | null,
          domain: state.page.domain ?? null,
          pathname: state.page.pathname ?? null,
          pageFingerprint: state.page.pageFingerprint ?? null,
          sourceConversationId: state.page.sourceConversationId ?? null,
          url: state.page.url ?? null,
          title: state.page.title ?? null,
          recentUserTurnText: state.page.recentUserTurnText ?? null,
          sessionId: null,
          approvedAt: new Date().toISOString(),
        });
      }
      await captureDeps.syncTabRemoteState(tabId, {
        force: true,
        reason: "capture_complete",
      });

      // Schedule drain for deferred captures
      if (result.digestStrategy === "deferred" && projectId) {
        scheduleDrain(projectId);
      }

      if (
        projectId &&
        result.digestOutcome &&
        (result.digestOutcome.status === "timed_out" || result.digestOutcome.status === "failed")
      ) {
        scheduleDrain(projectId, RETRY_DRAIN_DELAY_MS);
      }

      if (
        result.digestStrategy === "ai" &&
        result.digestOutcome &&
        result.digestOutcome.status !== "completed"
      ) {
        console.warn("[Relay BG] inline digest did not complete", {
          projectId,
          sessionId: result.sessionId ?? null,
          digestOutcome: result.digestOutcome,
        });
      }

      // Show the success toast after the saving state has had time to register.
      // Skip for silent incremental re-captures (skipAssociationToast=true) to avoid
      // noisy toasts when reopening already-saved chats.
      if (!skipAssociationToast) {
        const digestStatus =
          result.digestStrategy === "ai" && result.digestOutcome?.status === "completed"
            ? "analyzed" as const
          : result.digestStrategy === "deferred" ? "queued" as const
          : null;
        const { toast: doneToast } = buildDoneToast({
          projectId,
          projectName: state.projectName ?? projectName ?? "",
          digestStatus,
          personalSaved: result.personalRouting?.written ?? null,
          personalUnsure: result.personalRouting?.unsure ?? null,
        });
        await showAssociationToast(tabId, doneToast);
      }

      // Force other tabs to re-sync on next focus so they see fresh project state
      for (const [otherTabId, otherState] of tabStates.entries()) {
        if (otherTabId !== tabId) {
          otherState.lastSuccessfulSyncAt = null;
        }
      }

      // Store budget status for sidepanel display
      if (result.budgetStatus) {
        state.lastBudgetStatus = result.budgetStatus;
      }
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "capture",
        event: "capture_completed",
        flowId,
        message: "Completed extension capture.",
        projectId,
        tabId,
        context: {
          trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
          sessionId: result.sessionId ?? null,
          digestQueued: Boolean(result.digestQueued),
          turnCount: result.turns ?? state.page.turns ?? 0,
          captureSignature: state.page.captureSignature ?? null,
        },
      });
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "association",
        event: "chat_association_updated",
        flowId,
        message: "Saved chat association after capture.",
        projectId,
        tabId,
        context: {
          statusFrom: autoAssociated ? "pending" : "none",
          statusTo: "saved",
          sessionId: result.sessionId ?? null,
          source: autoCapture ? "auto_capture" : manualSelection ? "manual_capture" : "association",
        },
      });

      return {
        ok: true,
        projectId,
        projectName: associationProjectName ?? projectName ?? state.projectName ?? null,
        turns: result.turns ?? state.page.turns ?? 0,
        digestQueued: Boolean(result.digestQueued),
        digestStrategy: result.digestStrategy,
        digestStatus:
          result.digestStrategy === "ai" && result.digestOutcome?.status === "completed"
            ? "analyzed"
            : result.digestStrategy === "deferred"
              ? "queued"
              : null,
        skippedInsertedContext: Boolean(result.skippedInsertedContext),
        reason: result.reason ?? null,
        captured: true,
        autoAssociated,
        sessionId: result.sessionId ?? null,
        stateStatus: result.stateStatus ?? session.stateStatus,
      };
    }

    clearPendingAssociation(state, { clearChatAssociation: true });
    clearAssociationToast(state);
    state.lastError = result?.reason ?? "Capture failed.";
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "capture",
      event: "capture_failed",
      flowId,
      message: result?.reason ?? "Capture failed.",
      projectId: explicitProjectId ?? state.projectId ?? null,
      tabId,
      context: {
        trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
        captureSignature: state.page.captureSignature ?? null,
        turnCount: state.page.turns ?? 0,
      },
    });
    return result ?? { ok: false, reason: "Capture failed." };
  } finally {
    state.capturePending = false;
    state.capturePendingAt = null;
    clearCaptureTimer(state);
    await captureDeps.broadcastActiveProjectState(tabId);
  }
}
