// Step indices + the pure step-resolution for the HTML install onboarding.
// Kept out of the component so the skip-chain is unit-testable.
//
// 0:Welcome 1:Features 2:Auth 3:CreateProject 4:Persona 5:Videos 6:Paywall
// 7:Shortcuts 8:Pin
export const TOTAL_STEPS = 9
export const STEP_CREATE_PROJECT = 3
export const STEP_PERSONA = 4
export const STEP_VIDEOS = 5
export const STEP_PAYWALL = 6
export const STEP_SHORTCUTS = 7
export const STEP_PIN = 8

export interface OnboardingSkipState {
  /** User can run project setup (signed in, no project yet). */
  canSetup: boolean
  /** Persona already chosen (here or in the dashboard). */
  personaSet: boolean
  /** Walkthrough videos already seen in the dashboard. */
  videosSeen: boolean
}

/**
 * Resolve a target step, skipping setup steps already satisfied. The skips chain
 * (sequential reassignment), so landing on CreateProject with a project +
 * persona + videos done advances all the way to the Paywall — which always
 * shows ("second chance"), as do Shortcuts and Pin.
 */
export function resolveOnboardingStep(
  target: number,
  state: OnboardingSkipState,
): number {
  let s = Math.max(0, Math.min(target, TOTAL_STEPS - 1))
  if (s === STEP_CREATE_PROJECT && !state.canSetup) s = STEP_PERSONA
  if (s === STEP_PERSONA && state.personaSet) s = STEP_VIDEOS
  if (s === STEP_VIDEOS && state.videosSeen) s = STEP_PAYWALL
  return s
}
