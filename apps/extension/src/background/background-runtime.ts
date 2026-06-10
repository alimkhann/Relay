import {
  broadcastActiveProjectState,
} from "./active-project";
import {
  archiveChatAssociation,
  configureAssociationController,
  dismissCaptureReview,
  resolveAssociationToast,
  retargetAssociation,
} from "./association-controller";
import {
  captureObservedChange,
  configureCaptureController,
} from "./capture-controller";
import {
  configureCaptureScheduler,
  scheduleAutoCapture,
  scheduleInsertStateReset,
} from "./capture-scheduler";
import { createExternalMessageDispatcher } from "./external-message-dispatcher";
import { createInsertionController } from "./insertion-controller";
import { createPageController } from "./page-controller";
import { createSelectionSaveController } from "./selection-save-controller";
import { createSyncController } from "./sync-controller";
import {
  clearTabState,
  rehydrateTabSignatures,
} from "./tab-state-store";

export function createBackgroundRuntime() {
  void rehydrateTabSignatures();

  const {
    rememberProjectSelection,
    syncTabRemoteState,
  } = createSyncController({
    broadcastActiveProjectState,
    scheduleAutoCapture,
  });
  const {
    requestPageStateFromTab,
    refreshPageStateAndSyncIfMissing,
  } = createPageController({ syncTabRemoteState });
  const { handleSaveSelectionToRelay, showFailureToastInTab } =
    createSelectionSaveController({
      rememberProjectSelection,
      syncTabRemoteState,
    });
  const { insertProjectBrief } = createInsertionController({
    requestPageStateFromTab,
    syncTabRemoteState,
    rememberProjectSelection,
    broadcastActiveProjectState,
    scheduleInsertStateReset,
  });

  configureAssociationController({
    broadcastActiveProjectState,
    captureObservedChange,
    syncTabRemoteState,
  });
  configureCaptureController({
    broadcastActiveProjectState,
    rememberProjectSelection,
    requestPageStateFromTab,
    syncTabRemoteState,
  });
  configureCaptureScheduler({
    broadcastActiveProjectState,
    captureObservedChange,
  });

  const { dispatchExternalMessage } = createExternalMessageDispatcher({
    syncTabRemoteState,
  });

  return {
    archiveChatAssociation,
    broadcastActiveProjectState,
    captureObservedChange,
    clearTabState,
    dismissCaptureReview,
    dispatchExternalMessage,
    handleSaveSelectionToRelay,
    insertProjectBrief,
    rememberProjectSelection,
    requestPageStateFromTab,
    refreshPageStateAndSyncIfMissing,
    resolveAssociationToast,
    retargetAssociation,
    scheduleAutoCapture,
    showFailureToastInTab,
    syncTabRemoteState,
  };
}

export type BackgroundRuntime = ReturnType<typeof createBackgroundRuntime>;
