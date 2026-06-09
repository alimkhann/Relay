import { createBackgroundRuntime } from "./background-runtime";
import { registerBackgroundListeners } from "./background-listeners";
import { configureSidePanelOnActionClick } from "./background-lifecycle-listeners";
import { initializeBackgroundTelemetry } from "./telemetry";

initializeBackgroundTelemetry();
configureSidePanelOnActionClick();

const runtime = createBackgroundRuntime();
registerBackgroundListeners(runtime);
