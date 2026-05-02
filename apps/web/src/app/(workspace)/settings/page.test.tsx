import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  requirePageViewerMock,
  listExtensionTokensForUserMock,
  getUserSettingsMock,
  getBillingStatusForUserMock,
  getReferralProgramForUserMock,
} = vi.hoisted(() => ({
  requirePageViewerMock: vi.fn(),
  listExtensionTokensForUserMock: vi.fn(),
  getUserSettingsMock: vi.fn(),
  getBillingStatusForUserMock: vi.fn(),
  getReferralProgramForUserMock: vi.fn(),
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/settings/settings-preferences", () => ({
  SettingsPreferences: ({ section }: { section: string }) => <div>SettingsPreferences:{section}</div>,
}))

vi.mock("@/components/settings/settings-content", () => ({
  SettingsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/settings/billing-section", () => ({
  BillingSection: ({ referralProgram }: { referralProgram: { code: string } | null }) => (
    <div>BillingSection:{referralProgram ? "with-referral" : "no-referral"}</div>
  ),
}))

vi.mock("@/components/telemetry/page-telemetry", () => ({
  PageTelemetry: () => null,
}))

vi.mock("@/server/policies/viewer", () => ({
  requirePageViewer: requirePageViewerMock,
}))

vi.mock("@/server/services/extension-token-service", () => ({
  listExtensionTokensForUser: listExtensionTokensForUserMock,
}))

vi.mock("@/server/services/settings-service", () => ({
  getUserSettings: getUserSettingsMock,
}))

vi.mock("@/server/services/entitlement-service", () => ({
  getBillingStatusForUser: getBillingStatusForUserMock,
}))

vi.mock("@/server/services/referral-service", () => ({
  getReferralProgramForUser: getReferralProgramForUserMock,
}))

import SettingsPage from "./page"

describe("SettingsPage", () => {
  beforeEach(() => {
    requirePageViewerMock.mockReset()
    listExtensionTokensForUserMock.mockReset()
    getUserSettingsMock.mockReset()
    getBillingStatusForUserMock.mockReset()
    getReferralProgramForUserMock.mockReset()

    requirePageViewerMock.mockResolvedValue({
      userId: "user-1",
      name: "Relay User",
      email: "user@example.com",
    })
    listExtensionTokensForUserMock.mockResolvedValue([])
    getUserSettingsMock.mockResolvedValue({ settings: {} })
    getBillingStatusForUserMock.mockResolvedValue({
      entitlements: { isPaid: false, limits: {} },
      usage: {},
    })
  })

  it("does not fetch referral data for non-billing settings sections", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ section: "account" }) }))

    expect(screen.getByText("SettingsPreferences:account")).toBeTruthy()
    expect(getReferralProgramForUserMock).not.toHaveBeenCalled()
  })

  it("keeps billing settings rendering even if referral lookup fails", async () => {
    getReferralProgramForUserMock.mockRejectedValue(new Error("referrals unavailable"))

    render(await SettingsPage({ searchParams: Promise.resolve({ section: "billing" }) }))

    expect(screen.getByText("BillingSection:no-referral")).toBeTruthy()
  })
})
