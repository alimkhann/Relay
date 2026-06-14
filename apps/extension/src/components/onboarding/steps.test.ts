import { describe, it, expect } from "vitest"

import {
  resolveOnboardingStep,
  STEP_CREATE_PROJECT,
  STEP_PERSONA,
  STEP_VIDEOS,
  STEP_PAYWALL,
  STEP_PIN,
  TOTAL_STEPS,
} from "./steps"

const ALL_TO_DO = { canSetup: true, personaSet: false, videosSeen: false }

describe("resolveOnboardingStep", () => {
  it("keeps CreateProject when setup is available", () => {
    expect(resolveOnboardingStep(STEP_CREATE_PROJECT, ALL_TO_DO)).toBe(STEP_CREATE_PROJECT)
  })

  it("skips CreateProject to Persona when a project already exists", () => {
    expect(resolveOnboardingStep(STEP_CREATE_PROJECT, { ...ALL_TO_DO, canSetup: false })).toBe(
      STEP_PERSONA,
    )
  })

  it("skips Persona to Videos when persona is already set", () => {
    expect(resolveOnboardingStep(STEP_PERSONA, { ...ALL_TO_DO, personaSet: true })).toBe(STEP_VIDEOS)
  })

  it("skips Videos to Paywall when videos are already seen", () => {
    expect(resolveOnboardingStep(STEP_VIDEOS, { ...ALL_TO_DO, videosSeen: true })).toBe(STEP_PAYWALL)
  })

  it("chains all skips: project + persona + videos done -> Paywall", () => {
    expect(
      resolveOnboardingStep(STEP_CREATE_PROJECT, {
        canSetup: false,
        personaSet: true,
        videosSeen: true,
      }),
    ).toBe(STEP_PAYWALL)
  })

  it("always shows Paywall (never skipped)", () => {
    expect(resolveOnboardingStep(STEP_PAYWALL, { canSetup: false, personaSet: true, videosSeen: true })).toBe(
      STEP_PAYWALL,
    )
  })

  it("clamps out-of-range targets", () => {
    expect(resolveOnboardingStep(-5, ALL_TO_DO)).toBe(0)
    expect(resolveOnboardingStep(99, ALL_TO_DO)).toBe(TOTAL_STEPS - 1)
    expect(resolveOnboardingStep(99, ALL_TO_DO)).toBe(STEP_PIN)
  })
})
