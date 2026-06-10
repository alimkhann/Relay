import { personalCategoryFromMetadata } from "@relay/shared/constants/memory-taxonomy";
import { buildProjectContextPreview, getProjectContextCounts } from "@relay/shared/utils/project-context";

import type {
  RelayContextPreview,
  RelayTrustMetadata,
} from "../messaging/contracts";
import { formatUpdatedLabel } from "./bg-utils";
import type { ProjectDashboardPayload } from "./bg-types";
import { createEmptyContextPreview } from "./tab-state";

export function buildTrustMetadata(
  dashboard: ProjectDashboardPayload | null | undefined,
): RelayTrustMetadata {
  const timestampCandidates = [
    dashboard?.projectState?.updatedAt ?? null,
    dashboard?.stateStatus?.lastDigestAt ?? null,
    dashboard?.packets?.[0]?.createdAt ?? null,
  ].filter(Boolean) as string[];
  const updatedAt =
    timestampCandidates.sort(
      (left, right) => new Date(right).getTime() - new Date(left).getTime(),
    )[0] ?? null;

  const savedContextCount = dashboard ? getProjectContextCounts(dashboard).all : 0;

  return {
    updatedAt,
    updatedLabel: formatUpdatedLabel(updatedAt),
    recentChatCount: dashboard?.distinctConversationCount ?? 0,
    savedContextCount,
  };
}

export function buildDashboardContextPreview(
  dashboard: ProjectDashboardPayload | null | undefined,
): RelayContextPreview {
  if (!dashboard) {
    return createEmptyContextPreview();
  }

  const base = buildProjectContextPreview(dashboard);
  // Most-recent first; derived items (no capturedAt) sink to the bottom, order
  // preserved among themselves.
  const byRecency = <T extends { capturedAt?: string | null }>(items: T[]): T[] =>
    [...items].sort((a, b) => {
      const at = a.capturedAt ?? "";
      const bt = b.capturedAt ?? "";
      if (at && bt) return bt.localeCompare(at);
      if (at) return -1;
      if (bt) return 1;
      return 0;
    });
  // Personal memory is auto-routed (pinned=false) and surfaced by Folk category,
  // so the personal panel shows ALL notes; regular projects keep the compact
  // pinned-only preview.
  const isPersonal = dashboard.project?.kind === "personal";
  const byCapturedDesc = <T extends { capturedAt?: string | null; updatedAt: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => {
      const aTime = a.capturedAt ?? a.updatedAt;
      const bTime = b.capturedAt ?? b.updatedAt;
      return bTime.localeCompare(aTime);
    });
  const toNoteItem = (item: ProjectDashboardPayload["memory"][number]) => {
    let hostname: string | null = null;
    if (item.sourceUrl) {
      try {
        hostname = new URL(item.sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        hostname = null;
      }
    }
    return {
      key: `note:${item.id}`,
      memoryId: item.id,
      text: item.content,
      sourceUrl: item.sourceUrl,
      hostname,
      sourceSurface: item.sourceSurface,
      capturedAt: item.capturedAt ?? item.updatedAt,
      personalCategory: personalCategoryFromMetadata(item.metadata),
    };
  };

  const notes = byCapturedDesc(
    (dashboard.memory ?? []).filter(
      (item) => item.type === "note" && (isPersonal || item.pinned),
    ),
  )
    .slice(0, isPersonal ? 200 : 5)
    .map(toNoteItem);
  const requirements = byCapturedDesc(
    (dashboard.memory ?? []).filter((item) => item.type === "requirement"),
  )
    .slice(0, 100)
    .map(toNoteItem);

  return {
    decisions: byRecency(base.decisions),
    constraints: byRecency(base.constraints),
    tasks: byRecency(base.tasks),
    notes,
    requirements,
  };
}
