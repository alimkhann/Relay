import { BindingRepository } from "../repositories/binding-repository"
import { ContextPacketRepository } from "../repositories/context-packet-repository"
import { EventRepository } from "../repositories/event-repository"
import { ExtensionTokenRepository } from "../repositories/extension-token-repository"
import { MemberRepository } from "../repositories/member-repository"
import { MemoryRepository } from "../repositories/memory-repository"
import { ProfileRepository } from "../repositories/profile-repository"
import { ProjectRepository } from "../repositories/project-repository"
import { SessionRepository } from "../repositories/session-repository"
import { SettingsRepository } from "../repositories/settings-repository"
import { TargetProfileRepository } from "../repositories/target-profile-repository"
import { TurnRepository } from "../repositories/turn-repository"
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
  bindings: BindingRepository
  events: EventRepository
  settings: SettingsRepository
  targetProfiles: TargetProfileRepository
  extensionTokens: ExtensionTokenRepository
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
    bindings: new BindingRepository(provider),
    events: new EventRepository(provider),
    settings: new SettingsRepository(provider),
    targetProfiles: new TargetProfileRepository(provider),
    extensionTokens: new ExtensionTokenRepository(provider)
  }
}
