export { RelayApiClient } from "./api-client"
export {
  type RelayCliConfig,
  loadConfig,
  saveConfig,
  getConfigPath,
  requireConfig,
  clearConfig
} from "./config"
export {
  type DetectedIDE,
  detectIDEs,
  isDevMode,
  getMcpCommand
} from "./detect"
export { installMcpConfig, uninstallMcpConfig, validateInstalledMcpConfig } from "./install-mcp"
export {
  installClientSetup,
  uninstallClientSetup,
  installSkillFile,
  installUniversalSkillFile,
  uninstallSkillFile,
  uninstallUniversalSkillFile
} from "./install-skill"
export { type ProjectSummary, listProjects, getProjectDashboard } from "./project-api"
export { printBanner, success, info, warn, error, step } from "./ui"
export {
  type AuthResult,
  type ScopedMcpAuthResult,
  startAuthFlow,
  startScopedMcpAuthFlow
} from "./auth"
