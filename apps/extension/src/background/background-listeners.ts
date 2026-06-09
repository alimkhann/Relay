import type { BackgroundRuntime } from "./background-runtime";
import { registerBackgroundLifecycleListeners } from "./background-lifecycle-listeners";
import { registerInternalMessageListener } from "./message-dispatcher";

export function registerBackgroundListeners(runtime: BackgroundRuntime) {
  registerBackgroundLifecycleListeners({
    clearTabState: runtime.clearTabState,
    handleSaveSelectionToRelay: runtime.handleSaveSelectionToRelay,
    insertProjectBrief: runtime.insertProjectBrief,
    refreshPageStateAndSyncIfMissing: runtime.refreshPageStateAndSyncIfMissing,
    requestPageStateFromTab: runtime.requestPageStateFromTab,
    scheduleAutoCapture: runtime.scheduleAutoCapture,
    showFailureToastInTab: runtime.showFailureToastInTab,
    syncTabRemoteState: runtime.syncTabRemoteState,
  });
  registerInternalMessageListener({
    archiveChatAssociation: runtime.archiveChatAssociation,
    broadcastActiveProjectState: runtime.broadcastActiveProjectState,
    captureObservedChange: runtime.captureObservedChange,
    dismissCaptureReview: runtime.dismissCaptureReview,
    handleSaveSelectionToRelay: runtime.handleSaveSelectionToRelay,
    insertProjectBrief: runtime.insertProjectBrief,
    rememberProjectSelection: runtime.rememberProjectSelection,
    requestPageStateFromTab: runtime.requestPageStateFromTab,
    resolveAssociationToast: runtime.resolveAssociationToast,
    retargetAssociation: runtime.retargetAssociation,
    scheduleAutoCapture: runtime.scheduleAutoCapture,
    syncTabRemoteState: runtime.syncTabRemoteState,
  });

  chrome.runtime.onMessageExternal.addListener(
    (
      message: unknown,
      _sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => {
      void runtime.dispatchExternalMessage(message, sendResponse);
      return true;
    },
  );
}
