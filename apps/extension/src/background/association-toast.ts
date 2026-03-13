export interface DeriveAssociationToastStateInput {
  autoAssociated: boolean;
  wasHeldAssociation: boolean;
  hadSavedAssociation: boolean;
  sessionId: string | null;
  matchedProjectName: string | null;
  previousAssociationProjectName: string | null;
  routingCandidateProjectName: string | null;
  stateProjectName: string | null;
  sessionAssumedProjectName: string | null;
}

export interface AssociationToastState {
  projectName: string;
  shouldShowToast: boolean;
}

const FALLBACK_ASSOCIATION_PROJECT_NAME = "the selected project";

function normalizeName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function deriveAssociationToastState(
  input: DeriveAssociationToastStateInput,
): AssociationToastState {
  const projectName =
    normalizeName(input.matchedProjectName) ??
    normalizeName(input.previousAssociationProjectName) ??
    normalizeName(input.routingCandidateProjectName) ??
    normalizeName(input.stateProjectName) ??
    normalizeName(input.sessionAssumedProjectName) ??
    FALLBACK_ASSOCIATION_PROJECT_NAME;

  return {
    projectName,
    shouldShowToast:
      (input.autoAssociated || input.wasHeldAssociation) &&
      Boolean(normalizeName(input.sessionId)) &&
      !input.hadSavedAssociation,
  };
}
