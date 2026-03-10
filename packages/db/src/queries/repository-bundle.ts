import { BindingRepository } from "../repositories/binding-repository"
import { ContextPacketRepository } from "../repositories/context-packet-repository"
import { EventRepository } from "../repositories/event-repository"
import { MemberRepository } from "../repositories/member-repository"
import { MemoryRepository } from "../repositories/memory-repository"
import { ProjectRepository } from "../repositories/project-repository"
import { SessionRepository } from "../repositories/session-repository"
import { SettingsRepository } from "../repositories/settings-repository"
import { TargetProfileRepository } from "../repositories/target-profile-repository"
import { TurnRepository } from "../repositories/turn-repository"
import { createRepositoryProvider, type DatabaseProvider } from "../store/provider"

export interface RepositoryBundle {
  provider: DatabaseProvider
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
}

export function createRepositoryBundle(): RepositoryBundle {
  const provider = createRepositoryProvider()

  return {
    provider,
    projects: new ProjectRepository(provider),
    members: new MemberRepository(provider),
    sessions: new SessionRepository(provider),
    turns: new TurnRepository(provider),
    memory: new MemoryRepository(provider),
    contextPackets: new ContextPacketRepository(provider),
    bindings: new BindingRepository(provider),
    events: new EventRepository(provider),
    settings: new SettingsRepository(provider),
    targetProfiles: new TargetProfileRepository(provider)
  }
}
