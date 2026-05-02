import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  introMock,
  outroMock,
  selectMock,
  multiselectMock,
  confirmMock,
  isCancelMock,
  loadConfigMock,
  saveConfigMock,
  getConfigPathMock,
  clearConfigMock,
  buildManualMcpConfigMock,
  getAllClientsMock,
  installMcpConfigDetailedMock,
  installClientSetupMock,
  validateInstalledClientSetupMock,
  validateInstalledMcpConfigMock,
  uninstallMcpConfigMock,
  uninstallClientSetupMock,
  printBannerMock,
  successMock,
  infoMock,
  warnMock,
  stepMock,
  startUnifiedAuthFlowMock,
} = vi.hoisted(() => ({
  introMock: vi.fn(),
  outroMock: vi.fn(),
  selectMock: vi.fn(),
  multiselectMock: vi.fn(),
  confirmMock: vi.fn(),
  isCancelMock: vi.fn().mockReturnValue(false),
  loadConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
  getConfigPathMock: vi.fn().mockReturnValue("/tmp/relay-mcp.json"),
  clearConfigMock: vi.fn(),
  buildManualMcpConfigMock: vi.fn().mockReturnValue({ command: "npx", args: ["-y", "-p", "@onrelay/mcp", "relay-mcp"] }),
  getAllClientsMock: vi.fn(),
  installMcpConfigDetailedMock: vi.fn(),
  installClientSetupMock: vi.fn(),
  validateInstalledClientSetupMock: vi.fn(),
  validateInstalledMcpConfigMock: vi.fn(),
  uninstallMcpConfigMock: vi.fn(),
  uninstallClientSetupMock: vi.fn(),
  printBannerMock: vi.fn(),
  successMock: vi.fn(),
  infoMock: vi.fn(),
  warnMock: vi.fn(),
  stepMock: vi.fn(),
  startUnifiedAuthFlowMock: vi.fn(),
}))

vi.mock("@clack/prompts", () => ({
  intro: introMock,
  outro: outroMock,
  select: selectMock,
  multiselect: multiselectMock,
  confirm: confirmMock,
  isCancel: isCancelMock,
}))

vi.mock("@relay/cli-core", () => ({
  loadConfig: loadConfigMock,
  saveConfig: saveConfigMock,
  getConfigPath: getConfigPathMock,
  clearConfig: clearConfigMock,
  buildManualMcpConfig: buildManualMcpConfigMock,
  getAllClients: getAllClientsMock,
  installMcpConfigDetailed: installMcpConfigDetailedMock,
  installClientSetup: installClientSetupMock,
  validateInstalledClientSetup: validateInstalledClientSetupMock,
  validateInstalledMcpConfig: validateInstalledMcpConfigMock,
  uninstallMcpConfig: uninstallMcpConfigMock,
  uninstallClientSetup: uninstallClientSetupMock,
  printBanner: printBannerMock,
  success: successMock,
  info: infoMock,
  warn: warnMock,
  step: stepMock,
  startUnifiedAuthFlow: startUnifiedAuthFlowMock,
  RelayNodeAnalytics: class {},
}))

import { runWizardFlow } from "./wizard"

describe("runWizardFlow analytics", () => {
  beforeEach(() => {
    introMock.mockReset()
    outroMock.mockReset()
    selectMock.mockReset()
    multiselectMock.mockReset()
    confirmMock.mockReset()
    isCancelMock.mockReset()
    isCancelMock.mockReturnValue(false)
    loadConfigMock.mockReset()
    saveConfigMock.mockReset()
    clearConfigMock.mockReset()
    buildManualMcpConfigMock.mockReset()
    buildManualMcpConfigMock.mockReturnValue({ command: "npx", args: ["-y", "-p", "@onrelay/mcp", "relay-mcp"] })
    getAllClientsMock.mockReset()
    installMcpConfigDetailedMock.mockReset()
    installClientSetupMock.mockReset()
    validateInstalledClientSetupMock.mockReset()
    validateInstalledMcpConfigMock.mockReset()
    uninstallMcpConfigMock.mockReset()
    uninstallClientSetupMock.mockReset()
    printBannerMock.mockReset()
    successMock.mockReset()
    infoMock.mockReset()
    warnMock.mockReset()
    stepMock.mockReset()
    startUnifiedAuthFlowMock.mockReset()
  })

  it("captures the happy-path wizard lifecycle", async () => {
    loadConfigMock.mockResolvedValue(null)
    getAllClientsMock.mockResolvedValue([])
    startUnifiedAuthFlowMock.mockResolvedValue({
      apiBase: "https://www.onrelay.app",
      token: "token",
      accessToken: "access",
      refreshToken: "refresh",
      accessExpiresAt: "2026-04-22T00:00:00.000Z",
      refreshExpiresAt: "2026-04-23T00:00:00.000Z",
      projectId: "proj-1",
    })

    const analyticsClient = {
      capture: vi.fn(),
      captureException: vi.fn(),
      identify: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    }

    await runWizardFlow({ openBrowser: false }, analyticsClient)

    expect(analyticsClient.capture).toHaveBeenNthCalledWith(1, "wizard_started", expect.objectContaining({
      success: true,
      open_browser: false,
    }))
    expect(analyticsClient.capture).toHaveBeenCalledWith("wizard_auth_completed", expect.objectContaining({
      success: true,
      project_id: "proj-1",
    }))
    expect(analyticsClient.capture).toHaveBeenCalledWith("wizard_completed", expect.objectContaining({
      success: true,
      project_id: "proj-1",
    }))
    expect(analyticsClient.shutdown).toHaveBeenCalled()
  })

  it("captures auth failure lifecycle events", async () => {
    loadConfigMock.mockResolvedValue(null)
    getAllClientsMock.mockResolvedValue([])
    startUnifiedAuthFlowMock.mockRejectedValue(new Error("auth failed"))

    const analyticsClient = {
      capture: vi.fn(),
      captureException: vi.fn(),
      identify: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    }

    await expect(runWizardFlow({ openBrowser: false }, analyticsClient)).rejects.toThrow("auth failed")

    expect(analyticsClient.capture).toHaveBeenCalledWith("wizard_auth_failed", expect.objectContaining({
      success: false,
    }))
    expect(analyticsClient.capture).toHaveBeenCalledWith("wizard_failed", expect.objectContaining({
      success: false,
      stage: "auth",
    }))
  })
})
