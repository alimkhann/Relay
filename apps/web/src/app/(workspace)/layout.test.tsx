import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

const {
  cookiesMock,
  requirePageViewerMock,
  resolveOptionalViewerMock,
  syncViewerProfileMock,
  createRepositoryBundleMock,
  listProjectsForUserMock,
  getResolvedOnboardingStateForUserMock,
  getUserSettingsMock,
  resolveViewerEntitlementsMock,
  listExtensionTokensForUserMock,
  getReferralProgramForUserMock,
  getUsageCountMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  requirePageViewerMock: vi.fn(),
  resolveOptionalViewerMock: vi.fn(),
  syncViewerProfileMock: vi.fn(),
  createRepositoryBundleMock: vi.fn(),
  listProjectsForUserMock: vi.fn(),
  getResolvedOnboardingStateForUserMock: vi.fn(),
  getUserSettingsMock: vi.fn(),
  resolveViewerEntitlementsMock: vi.fn(),
  listExtensionTokensForUserMock: vi.fn(),
  getReferralProgramForUserMock: vi.fn(),
  getUsageCountMock: vi.fn(),
}))

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: createRepositoryBundleMock,
}))

vi.mock("@/components/onboarding/auto-capture-onboarding-banner", () => ({
  AutoCaptureOnboardingBanner: () => <div>AutoCaptureOnboardingBanner</div>,
}))

vi.mock("@/components/layout/sidebar-context", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/layout/sidebar-main-area", () => ({
  SidebarMainArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/auth/session-keepalive", () => ({
  SessionKeepalive: () => null,
}))

vi.mock("@/components/telemetry/posthog-identity", () => ({
  PostHogIdentity: () => null,
}))

vi.mock("@/components/layout/workspace-sidebar-shell", () => ({
  WorkspaceSidebarShell: () => <div>WorkspaceSidebarShell</div>,
}))

vi.mock("@/server/policies/viewer", () => ({
  requirePageViewer: requirePageViewerMock,
  resolveOptionalViewer: resolveOptionalViewerMock,
  syncViewerProfile: syncViewerProfileMock,
}))

vi.mock("@/server/services/referral-service", () => ({
  attachReferralForUser: vi.fn(),
  decodeReferralCookie: vi.fn(() => null),
  getReferralProgramForUser: getReferralProgramForUserMock,
  REFERRAL_COOKIE_NAME: "relay_referral",
}))

vi.mock("@/server/services/onboarding-service", () => ({
  getResolvedOnboardingStateForUser: getResolvedOnboardingStateForUserMock,
}))

vi.mock("@/server/services/extension-token-service", () => ({
  listExtensionTokensForUser: listExtensionTokensForUserMock,
}))

vi.mock("@/server/services/project-service", () => ({
  listProjectsForUser: listProjectsForUserMock,
}))

vi.mock("@/server/services/settings-service", () => ({
  getUserSettings: getUserSettingsMock,
}))

vi.mock("@/server/services/entitlement-service", () => ({
  resolveViewerEntitlements: resolveViewerEntitlementsMock,
  getUsageCount: getUsageCountMock,
}))

import WorkspaceLayout from "./layout"

describe("WorkspaceLayout", () => {
  beforeEach(() => {
    cookiesMock.mockReset()
    requirePageViewerMock.mockReset()
    resolveOptionalViewerMock.mockReset()
    syncViewerProfileMock.mockReset()
    createRepositoryBundleMock.mockReset()
    listProjectsForUserMock.mockReset()
    getResolvedOnboardingStateForUserMock.mockReset()
    getUserSettingsMock.mockReset()
    resolveViewerEntitlementsMock.mockReset()
    listExtensionTokensForUserMock.mockReset()
    getReferralProgramForUserMock.mockReset()
    getUsageCountMock.mockReset()

    cookiesMock.mockResolvedValue({
      get: () => undefined,
    })
    requirePageViewerMock.mockResolvedValue(null)
    resolveOptionalViewerMock.mockResolvedValue(null)
    createRepositoryBundleMock.mockReturnValue({
      profiles: { getById: vi.fn() },
    })
  })

  it("lets child routes handle unauthenticated redirects instead of forcing dashboard auth in the layout", async () => {
    render(
      await WorkspaceLayout({
        children: <div>Settings body</div>,
      }),
    )

    expect(screen.getByText("Settings body")).toBeTruthy()
    expect(screen.queryByText("WorkspaceSidebarShell")).toBeNull()
    expect(syncViewerProfileMock).not.toHaveBeenCalled()
    expect(createRepositoryBundleMock).not.toHaveBeenCalled()
    expect(listProjectsForUserMock).not.toHaveBeenCalled()
  })

  it("syncs the viewer profile before FK-dependent operations on authenticated render", async () => {
    const viewer = {
      userId: "user-1",
      mode: "session",
      email: "user@example.com",
      name: "Relay User",
    }
    resolveOptionalViewerMock.mockResolvedValue(viewer)
    createRepositoryBundleMock.mockReturnValue({
      profiles: {
        getById: vi.fn().mockResolvedValue({
          id: "user-1",
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      },
    })
    listProjectsForUserMock.mockResolvedValue([{ id: "project-1", name: "Relay" }])
    getResolvedOnboardingStateForUserMock.mockResolvedValue({ status: "completed" })
    getUserSettingsMock.mockResolvedValue({ settings: {} })
    resolveViewerEntitlementsMock.mockResolvedValue({
      plan: "free",
      isPaid: false,
      limits: { captureMonthly: 100 },
    })
    listExtensionTokensForUserMock.mockResolvedValue([])
    getReferralProgramForUserMock.mockResolvedValue(null)
    getUsageCountMock.mockResolvedValue(0)

    render(
      await WorkspaceLayout({
        children: <div>Workspace body</div>,
      }),
    )

    expect(screen.getByText("Workspace body")).toBeTruthy()
    expect(syncViewerProfileMock).toHaveBeenCalledWith(viewer)
  })
})
