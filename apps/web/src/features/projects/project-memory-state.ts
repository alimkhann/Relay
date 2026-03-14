import type { ProjectDashboardDto } from "@relay/shared";

export interface ProjectMemoryDrafts {
  overview: string;
  objective: string;
  progress: string;
}

export function deriveProjectMemoryDrafts(input: {
  dashboard: ProjectDashboardDto;
  fallbackOverview?: string | null;
}): ProjectMemoryDrafts {
  return {
    overview:
      input.dashboard.stateOverrides?.projectOverviewOverride ??
      input.dashboard.projectState?.projectOverview ??
      input.fallbackOverview ??
      "",
    objective:
      input.dashboard.stateOverrides?.currentObjectiveOverride ??
      input.dashboard.projectState?.currentObjective ??
      "",
    progress:
      input.dashboard.stateOverrides?.recentProgressOverride ??
      input.dashboard.projectState?.recentProgress ??
      "",
  };
}

function normalizeDraft(value: string) {
  return value.trim();
}

export function buildProjectMemoryOverridePatch(
  current: ProjectMemoryDrafts,
  initial: ProjectMemoryDrafts,
) {
  const payload: {
    projectOverviewOverride?: string | null;
    currentObjectiveOverride?: string | null;
    recentProgressOverride?: string | null;
  } = {};

  if (normalizeDraft(current.overview) !== normalizeDraft(initial.overview)) {
    payload.projectOverviewOverride = normalizeDraft(current.overview) || null;
  }

  if (normalizeDraft(current.objective) !== normalizeDraft(initial.objective)) {
    payload.currentObjectiveOverride = normalizeDraft(current.objective) || null;
  }

  if (normalizeDraft(current.progress) !== normalizeDraft(initial.progress)) {
    payload.recentProgressOverride = normalizeDraft(current.progress) || null;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}
