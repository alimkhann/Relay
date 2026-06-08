import { createFlowId } from "@relay/shared/utils/telemetry";
import { slugify } from "@relay/shared/utils/text";
import type { RelayOnboardingState } from "@relay/shared";
import type { RelayMessage } from "../messaging/contracts";
import { getRelaySession, setRelaySession } from "../storage/session";
import { relayFetch } from "../utils/api";
import { readErrorResponse } from "./bg-utils";
import { sessionCache } from "./state";
import { recordBackgroundTelemetry } from "./telemetry";

export async function handleProjectMessage(
  message: RelayMessage,
  sendResponse: (response?: unknown) => void,
) {
  if (message.type === "RELAY_SCAN_PROJECT_URL") {
    try {
      const flowId = message.payload.flowId ?? createFlowId("ext-project-scan");
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "projects",
        event: "project_scan_url.started",
        flowId,
        message: "Received project URL scan request from the extension UI.",
      });

      const response = await relayFetch("/api/projects/scan-url", {
        method: "POST",
        headers: {
          "x-relay-flow-id": flowId,
        },
        body: JSON.stringify({
          url: message.payload.url,
        }),
      });

      if (!response.ok) {
        const reason = await readErrorResponse(response, "URL scan failed.");
        recordBackgroundTelemetry({
          level: "warn",
          surface: "extension-background",
          area: "projects",
          event: "project_scan_url.failed",
          flowId,
          message: reason,
          context: {
            status: response.status,
          },
        });
        sendResponse({ ok: false, reason });
    return true;
      }

      const result = (await response.json()) as {
        name: string | null;
        description: string | null;
        url: string;
      };
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "projects",
        event: "project_scan_url.succeeded",
        flowId,
        message: "Project URL scan completed from the extension.",
        context: {
          hasName: Boolean(result.name),
          hasDescription: Boolean(result.description),
        },
      });
      sendResponse({ ok: true, result });
    } catch (cause) {
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "projects",
        event: "project_scan_url.exception",
        message: "Project URL scan threw an exception in the background worker.",
        error: cause,
      });
      sendResponse({
        ok: false,
        reason: cause instanceof Error ? cause.message : "URL scan failed.",
      });
    }
    return true;
  }

  if (message.type === "RELAY_CREATE_PROJECT") {
    try {
      const flowId = message.payload.flowId ?? createFlowId("ext-project");
      const slug =
        message.payload.slug ?? slugify(message.payload.name).slice(0, 80);
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "projects",
        event: "project_create.started",
        flowId,
        message: "Received project creation request from the extension UI.",
        context: {
          name: message.payload.name,
          slug,
        },
      });
      const response = await relayFetch("/api/projects", {
        method: "POST",
        headers: {
          "x-relay-flow-id": flowId,
        },
        body: JSON.stringify({
          name: message.payload.name,
          slug,
          description: message.payload.description ?? null,
          projectUrl: message.payload.projectUrl ?? null,
        }),
      });
      console.log("[Relay BG] create project response status:", response.status);
      recordBackgroundTelemetry({
        level: response.ok ? "info" : "warn",
        surface: "extension-background",
        area: "projects",
        event: "project_create.api_response",
        flowId,
        message: `Project creation returned ${response.status}.`,
        context: {
          status: response.status,
        },
      });

      if (!response.ok) {
        const reason = await readErrorResponse(
          response,
          "Project creation failed.",
        );
        console.log("[Relay BG] create project failed:", reason);
        recordBackgroundTelemetry({
          level: "error",
          surface: "extension-background",
          area: "projects",
          event: "project_create.failed",
          flowId,
          message: reason,
          context: {
            name: message.payload.name,
            slug,
          },
        });
        sendResponse({ ok: false, reason });
    return true;
      }

      const payload = (await response.json()) as {
        project: { id: string; name: string; slug?: string };
        onboarding?: RelayOnboardingState;
      };
      sessionCache.current = null;
      await setRelaySession({
        projectId: payload.project.id,
        assumedProjectId: payload.project.id,
        assumedProjectName: payload.project.name,
        onboarding:
          payload.onboarding ?? {
            status: "completed",
            completedProjectId: payload.project.id,
            completedVia: "extension",
            completedAt: new Date().toISOString(),
          },
      });
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "projects",
        event: "project_create.succeeded",
        flowId,
        message: `Created project ${payload.project.id} from extension onboarding.`,
        context: {
          projectId: payload.project.id,
          slug: payload.project.slug ?? slug,
        },
      });

      sendResponse({ ok: true, project: payload.project });
    } catch (cause) {
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "projects",
        event: "project_create.exception",
        message: "Project creation threw an exception in the background worker.",
        error: cause,
      });
      sendResponse({
        ok: false,
        reason:
          cause instanceof Error
            ? cause.message
            : "Project creation failed.",
      });
    }
    return true;
  }

  if (message.type === "RELAY_UPDATE_PROJECT") {
    try {
      const flowId = message.payload.flowId ?? createFlowId("ext-project-update");
      const response = await relayFetch(`/api/projects/${message.payload.projectId}`, {
        method: "PATCH",
        headers: { "x-relay-flow-id": flowId },
        body: JSON.stringify({
          name: message.payload.name,
          description: message.payload.description ?? null,
          projectUrl: message.payload.projectUrl ?? null,
        }),
      });
      if (!response.ok) {
        const reason = await readErrorResponse(response, "Project update failed.");
        sendResponse({ ok: false, reason });
    return true;
      }
      const payload = (await response.json()) as {
        project: { id: string; name: string; description: string | null; projectUrl: string | null };
      };
      const session = await getRelaySession();
      const updatedOptions = session.projectOptions?.map((p) =>
        p.id === payload.project.id
          ? { ...p, name: payload.project.name, description: payload.project.description, projectUrl: payload.project.projectUrl }
          : p
      ) ?? [];
      sessionCache.current = null;
      await setRelaySession({
        projectOptions: updatedOptions,
        ...(session.assumedProjectId === payload.project.id
          ? { assumedProjectName: payload.project.name }
          : {}),
      });
      sendResponse({ ok: true, project: payload.project });
    } catch (cause) {
      sendResponse({ ok: false, reason: cause instanceof Error ? cause.message : "Project update failed." });
    }
    return true;
  }

  if (message.type === "RELAY_DELETE_PROJECT") {
    try {
      const flowId = message.payload.flowId ?? createFlowId("ext-project-delete");
      const response = await relayFetch(`/api/projects/${message.payload.projectId}`, {
        method: "DELETE",
        headers: { "x-relay-flow-id": flowId },
      });
      if (!response.ok) {
        const reason = await readErrorResponse(response, "Project deletion failed.");
        sendResponse({ ok: false, reason });
    return true;
      }
      const session = await getRelaySession();
      const remainingOptions = session.projectOptions?.filter((p) => p.id !== message.payload.projectId) ?? [];
      const wasActive = session.projectId === message.payload.projectId || session.assumedProjectId === message.payload.projectId;
      const nextProject = wasActive ? (remainingOptions[0] ?? null) : null;
      sessionCache.current = null;
      await setRelaySession({
        projectOptions: remainingOptions,
        ...(wasActive
          ? {
              projectId: nextProject?.id ?? "",
              assumedProjectId: nextProject?.id ?? "",
              assumedProjectName: nextProject?.name ?? "",
            }
          : {}),
      });
      sendResponse({ ok: true });
    } catch (cause) {
      sendResponse({ ok: false, reason: cause instanceof Error ? cause.message : "Project deletion failed." });
    }
    return true;
  }


  return false;
}
