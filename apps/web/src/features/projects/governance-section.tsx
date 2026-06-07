"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type MemoryItemType,
  type ProjectContextItem,
  type ProjectContextSection,
  type ProjectDashboardDto,
} from "@relay/shared";
import { buildProjectContextItems } from "@relay/shared/utils/project-context";

import {
  MemoryColumnBoard,
  type BoardColumn,
} from "@/features/memory/memory-column-board";
import { relayClientFetch } from "@/lib/telemetry/fetch";

/* ─── Types ─── */

type ContextSection = ProjectContextSection;
type ContextItem = ProjectContextItem;

/* ─── Constants ─── */

const labelBySection: Record<ContextSection, string> = {
  decision: "Decisions",
  constraint: "Constraints",
  task: "Tasks",
};

const memoryTypeBySection: Record<ContextSection, MemoryItemType> = {
  decision: "decision",
  constraint: "constraint",
  task: "task",
};

const colorBySection: Record<ContextSection, string> = {
  decision: "var(--relay-section-decision)",
  constraint: "var(--relay-section-constraint)",
  task: "var(--relay-section-task)",
};

const hiddenKeyBySection: Record<
  ContextSection,
  "hiddenDecisions" | "hiddenConstraints" | "hiddenOpenTasks"
> = {
  decision: "hiddenDecisions",
  constraint: "hiddenConstraints",
  task: "hiddenOpenTasks",
};

/* ─── Component ─── */

const NOTES_COLOR = "#a1a1aa";
const REQUIREMENTS_COLOR = "#ef4444";

export function GovernanceSection({
  projectId,
  dashboard,
  visibleSections: visibleSectionsProp,
  includeNotes = false,
  includeRequirements = false,
}: {
  projectId: string;
  dashboard: ProjectDashboardDto;
  visibleSections?: readonly ContextSection[];
  /** Append a Notes column (plain memory items) alongside the governed columns. */
  includeNotes?: boolean;
  /** Append a Requirements column (plain memory items). */
  includeRequirements?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  const sections: ContextSection[] = visibleSectionsProp
    ? [...visibleSectionsProp]
    : ["decision", "task", "constraint"];

  /* ─── Mutations ─── */

  function runMutation(
    action: () => Promise<void>,
    pendingMsg: string,
    doneMsg: string,
  ) {
    startTransition(() => {
      void (async () => {
        setStatus(pendingMsg);
        try {
          await action();
          setStatus(doneMsg);
          router.refresh();
        } catch (cause) {
          setStatus(
            cause instanceof Error ? cause.message : "Request failed.",
          );
        }
      })();
    });
  }

  function removeItem(item: ContextItem) {
    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const res = await relayClientFetch(
            `/api/memory/${item.memoryId}`,
            { method: "DELETE" },
          );
          if (!res.ok) throw new Error("Removal failed.");
        },
        "Removing…",
        "Removed.",
      );
      return;
    }
    const current =
      dashboard.stateOverrides?.[hiddenKeyBySection[item.section]] ?? [];
    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${projectId}/state`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              [hiddenKeyBySection[item.section]]: [
                ...new Set([...current, item.text]),
              ],
            }),
          },
        );
        if (!res.ok) throw new Error("Update failed.");
      },
      "Updating…",
      "Updated.",
    );
  }

  function addManualContext(section: ContextSection, text: string) {
    const value = text.trim();
    if (!value) return;
    runMutation(
      async () => {
        const res = await relayClientFetch(
          `/api/projects/${projectId}/memory`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: memoryTypeBySection[section],
              title: null,
              content: value,
              sourceSurface: "web",
            }),
          },
        );
        if (!res.ok) throw new Error("Creation failed.");
      },
      "Adding…",
      "Added.",
    );
  }

  function saveEdit(item: ContextItem, nextText: string) {
    const value = nextText.trim();
    if (!value) return;
    if (item.source === "manual" && item.memoryId) {
      runMutation(
        async () => {
          const res = await relayClientFetch(
            `/api/memory/${item.memoryId}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ content: value }),
            },
          );
          if (!res.ok) throw new Error("Update failed.");
        },
        "Saving…",
        "Saved.",
      );
      return;
    }
    runMutation(
      async () => {
        const createRes = await relayClientFetch(
          `/api/projects/${projectId}/memory`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: memoryTypeBySection[item.section],
              title: null,
              content: value,
              sourceSurface: "web",
            }),
          },
        );
        if (!createRes.ok) throw new Error("Replacement failed.");
        const current =
          dashboard.stateOverrides?.[hiddenKeyBySection[item.section]] ?? [];
        const hideRes = await relayClientFetch(
          `/api/projects/${projectId}/state`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              [hiddenKeyBySection[item.section]]: [
                ...new Set([...current, item.text]),
              ],
            }),
          },
        );
        if (!hideRes.ok) throw new Error("Failed to hide old item.");
      },
      "Replacing…",
      "Replaced.",
    );
  }

  /* ─── Notes / requirements (plain memory items, not project state) ─── */

  function addMemoryItem(type: "note" | "requirement", text: string) {
    const value = text.trim();
    if (!value) return;
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/projects/${projectId}/memory`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type,
            title: null,
            content: value,
            sourceSurface: "web",
          }),
        });
        if (!res.ok) throw new Error("Creation failed.");
      },
      "Adding…",
      "Added.",
    );
  }

  function editNote(memoryId: string, nextText: string) {
    const value = nextText.trim();
    if (!value) return;
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/memory/${memoryId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: value }),
        });
        if (!res.ok) throw new Error("Update failed.");
      },
      "Saving…",
      "Saved.",
    );
  }

  function deleteNote(memoryId: string) {
    runMutation(
      async () => {
        const res = await relayClientFetch(`/api/memory/${memoryId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Removal failed.");
      },
      "Removing…",
      "Removed.",
    );
  }

  const columns: BoardColumn[] = sections.map((section) => ({
    key: section,
    label: labelBySection[section],
    color: colorBySection[section],
    addPlaceholder: `Add ${section}…`,
    onAdd: (text) => addManualContext(section, text),
    rows: buildProjectContextItems(dashboard, section).map((item) => ({
      key: item.key,
      text: item.text,
      sourceSurface: item.sourceSurface,
      capturedAt: item.capturedAt,
      derived: item.source === "derived",
      onEdit: (next) => saveEdit(item, next),
      onDelete: () => removeItem(item),
    })),
  }));

  if (includeNotes) {
    columns.push({
      key: "note",
      label: "Notes",
      color: NOTES_COLOR,
      addPlaceholder: "Add note…",
      onAdd: (text) => addMemoryItem("note", text),
      rows: dashboard.memory
        .filter((item) => item.type === "note")
        .map((item) => ({
          key: item.id,
          text: item.content,
          sourceSurface: item.sourceSurface,
          sourceUrl: item.sourceUrl,
          capturedAt: item.capturedAt ?? item.updatedAt,
          onEdit: (next) => editNote(item.id, next),
          onDelete: () => deleteNote(item.id),
        })),
    });
  }

  if (includeRequirements) {
    columns.push({
      key: "requirement",
      label: "Requirements",
      color: REQUIREMENTS_COLOR,
      addPlaceholder: "Add requirement…",
      onAdd: (text) => addMemoryItem("requirement", text),
      rows: dashboard.memory
        .filter((item) => item.type === "requirement")
        .map((item) => ({
          key: item.id,
          text: item.content,
          sourceSurface: item.sourceSurface,
          sourceUrl: item.sourceUrl,
          capturedAt: item.capturedAt ?? item.updatedAt,
          onEdit: (next) => editNote(item.id, next),
          onDelete: () => deleteNote(item.id),
        })),
    });
  }

  return (
    <MemoryColumnBoard
      columns={columns}
      layout={columns.length > 3 ? "scroll" : "grid"}
      pending={pending}
      status={status}
    />
  );
}
