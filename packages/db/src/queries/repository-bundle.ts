import { BrowserSessionHandoffRepository } from "../repositories/browser-session-handoff-repository"
import { AiJobRunRepository } from "../repositories/ai-job-run-repository"
import { BindingRepository } from "../repositories/binding-repository"
import { BootstrapPacketRepository } from "../repositories/bootstrap-packet-repository"
import { ContextPacketRepository } from "../repositories/context-packet-repository"
import { EventRepository } from "../repositories/event-repository"
import { ExtensionConnectGrantRepository } from "../repositories/extension-connect-grant-repository"
import { ExtensionTokenRepository } from "../repositories/extension-token-repository"
import { MemberRepository } from "../repositories/member-repository"
import { MemoryRepository } from "../repositories/memory-repository"
import { ProfileRepository } from "../repositories/profile-repository"
import { ProjectRepository } from "../repositories/project-repository"
import { ProjectStateRepository } from "../repositories/project-state-repository"
import { ProjectStateOverrideRepository } from "../repositories/project-state-override-repository"
import { SessionRepository } from "../repositories/session-repository"
import { SessionDigestRepository } from "../repositories/session-digest-repository"
import { SettingsRepository } from "../repositories/settings-repository"
import { TargetProfileRepository } from "../repositories/target-profile-repository"
import { TurnRepository } from "../repositories/turn-repository"
import { UserOnboardingRepository } from "../repositories/user-onboarding-repository"
import { createRepositoryProvider, type DatabaseProvider } from "../store/provider"

export interface RepositoryBundle {
  provider: DatabaseProvider
  profiles: ProfileRepository
  projects: ProjectRepository
  members: MemberRepository
  sessions: SessionRepository
  turns: TurnRepository
  memory: MemoryRepository
  contextPackets: ContextPacketRepository
  sessionDigests: SessionDigestRepository
  projectState: ProjectStateRepository
  projectStateOverrides: ProjectStateOverrideRepository
  bootstrapPackets: BootstrapPacketRepository
  aiJobs: AiJobRunRepository
  bindings: BindingRepository
  events: EventRepository
  settings: SettingsRepository
  targetProfiles: TargetProfileRepository
  extensionTokens: ExtensionTokenRepository
  extensionConnectGrants: ExtensionConnectGrantRepository
  userOnboarding: UserOnboardingRepository
  browserSessionHandoffs: BrowserSessionHandoffRepository
}

export function createRepositoryBundle(viewerUserId?: string): RepositoryBundle {
  const provider = createRepositoryProvider(viewerUserId)

  return {
    provider,
    profiles: new ProfileRepository(provider),
    projects: new ProjectRepository(provider),
    members: new MemberRepository(provider),
    sessions: new SessionRepository(provider),
    turns: new TurnRepository(provider),
    memory: new MemoryRepository(provider),
    contextPackets: new ContextPacketRepository(provider),
    sessionDigests: new SessionDigestRepository(provider),
    projectState: new ProjectStateRepository(provider),
    projectStateOverrides: new ProjectStateOverrideRepository(provider),
    bootstrapPackets: new BootstrapPacketRepository(provider),
    aiJobs: new AiJobRunRepository(provider),
    bindings: new BindingRepository(provider),
    events: new EventRepository(provider),
    settings: new SettingsRepository(provider),
    targetProfiles: new TargetProfileRepository(provider),
    extensionTokens: new ExtensionTokenRepository(provider),
    extensionConnectGrants: new ExtensionConnectGrantRepository(provider),
    userOnboarding: new UserOnboardingRepository(provider),
    browserSessionHandoffs: new BrowserSessionHandoffRepository(provider)
  }
}
