import { createBackgroundRuntime } from "./background-runtime";
import { registerBackgroundListeners } from "./background-listeners";
import { initializeBackgroundTelemetry } from "./telemetry";

initializeBackgroundTelemetry();

const runtime = createBackgroundRuntime();
registerBackgroundListeners(runtime);
