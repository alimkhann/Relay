import { BrowserSessionHandoffRepository } from "../repositories/browser-session-handoff-repository"
import { CliAuthSessionRepository } from "../repositories/cli-auth-session-repository"
import { AiJobRunRepository } from "../repositories/ai-job-run-repository"
import { BindingRepository } from "../repositories/binding-repository"
import { BillingCustomerRepository } from "../repositories/billing-customer-repository"
import { BillingWebhookEventRepository } from "../repositories/billing-webhook-event-repository"
import { BillingWebhookRawDeliveryRepository } from "../repositories/billing-webhook-raw-delivery-repository"
import { BootstrapPacketRepository } from "../repositories/bootstrap-packet-repository"
import { ContextPacketRepository } from "../repositories/context-packet-repository"
import { EventRepository } from "../repositories/event-repository"
import { ExtensionConnectGrantRepository } from "../repositories/extension-connect-grant-repository"
import { EntitlementRepository } from "../repositories/entitlement-repository"
import { ExtensionTokenRepository } from "../repositories/extension-token-repository"
import { MemberRepository } from "../repositories/member-repository"
import { MemoryEventRepository } from "../repositories/memory-event-repository"
import { MemoryRepository } from "../repositories/memory-repository"
import { McpAuthSessionRepository } from "../repositories/mcp-auth-session-repository"
import { McpTokenRepository } from "../repositories/mcp-token-repository"
import { ProfileRepository } from "../repositories/profile-repository"
import { ProjectRepository } from "../repositories/project-repository"
import { ProjectStateRepository } from "../repositories/project-state-repository"
import { ProjectStateOverrideRepository } from "../repositories/project-state-override-repository"
import { SessionRepository } from "../repositories/session-repository"
import { SessionDigestRepository } from "../repositories/session-digest-repository"
import { SettingsRepository } from "../repositories/settings-repository"
import { SubscriptionRepository } from "../repositories/subscription-repository"
import { SyncMarkRepository } from "../repositories/sync-mark-repository"
import { TargetProfileRepository } from "../repositories/target-profile-repository"
import { TurnRepository } from "../repositories/turn-repository"
import { UserOnboardingRepository } from "../repositories/user-onboarding-repository"
import { UsageCounterRepository } from "../repositories/usage-counter-repository"
import { WorkSessionCheckpointRepository } from "../repositories/work-session-checkpoint-repository"
import { WorkSessionEventRepository } from "../repositories/work-session-event-repository"
import { WorkSessionRepository } from "../repositories/work-session-repository"
import { createRepositoryProvider, type DatabaseProvider } from "../store/provider"

export interface RepositoryBundle {
  provider: DatabaseProvider
  billingCustomers: BillingCustomerRepository
  billingWebhookEvents: BillingWebhookEventRepository
  billingWebhookRawDeliveries: BillingWebhookRawDeliveryRepository
  profiles: ProfileRepository
  projects: ProjectRepository
  members: MemberRepository
  sessions: SessionRepository
  turns: TurnRepository
  memory: MemoryRepository
  memoryEvents: MemoryEventRepository
  mcpAuthSessions: McpAuthSessionRepository
  mcpTokens: McpTokenRepository
  contextPackets: ContextPacketRepository
  sessionDigests: SessionDigestRepository
  projectState: ProjectStateRepository
  projectStateOverrides: ProjectStateOverrideRepository
  bootstrapPackets: BootstrapPacketRepository
  entitlements: EntitlementRepository
  aiJobs: AiJobRunRepository
  bindings: BindingRepository
  events: EventRepository
  settings: SettingsRepository
  subscriptions: SubscriptionRepository
  syncMarks: SyncMarkRepository
  targetProfiles: TargetProfileRepository
  extensionTokens: ExtensionTokenRepository
  extensionConnectGrants: ExtensionConnectGrantRepository
  userOnboarding: UserOnboardingRepository
  usageCounters: UsageCounterRepository
  browserSessionHandoffs: BrowserSessionHandoffRepository
  cliAuthSessions: CliAuthSessionRepository
  workSessions: WorkSessionRepository
  workSessionEvents: WorkSessionEventRepository
  workSessionCheckpoints: WorkSessionCheckpointRepository
}

export function createRepositoryBundle(
  viewerUserId?: string,
  providerOverride?: DatabaseProvider,
): RepositoryBundle {
  const provider = providerOverride ?? createRepositoryProvider(viewerUserId)

  return {
    provider,
    billingCustomers: new BillingCustomerRepository(provider),
    billingWebhookEvents: new BillingWebhookEventRepository(provider),
    billingWebhookRawDeliveries: new BillingWebhookRawDeliveryRepository(provider),
    profiles: new ProfileRepository(provider),
    projects: new ProjectRepository(provider),
    members: new MemberRepository(provider),
    sessions: new SessionRepository(provider),
    turns: new TurnRepository(provider),
    memory: new MemoryRepository(provider),
    memoryEvents: new MemoryEventRepository(provider),
    mcpAuthSessions: new McpAuthSessionRepository(provider),
    mcpTokens: new McpTokenRepository(provider),
    contextPackets: new ContextPacketRepository(provider),
    sessionDigests: new SessionDigestRepository(provider),
    projectState: new ProjectStateRepository(provider),
    projectStateOverrides: new ProjectStateOverrideRepository(provider),
    bootstrapPackets: new BootstrapPacketRepository(provider),
    entitlements: new EntitlementRepository(provider),
    aiJobs: new AiJobRunRepository(provider),
    bindings: new BindingRepository(provider),
    events: new EventRepository(provider),
    settings: new SettingsRepository(provider),
    subscriptions: new SubscriptionRepository(provider),
    syncMarks: new SyncMarkRepository(provider),
    targetProfiles: new TargetProfileRepository(provider),
    extensionTokens: new ExtensionTokenRepository(provider),
    extensionConnectGrants: new ExtensionConnectGrantRepository(provider),
    userOnboarding: new UserOnboardingRepository(provider),
    usageCounters: new UsageCounterRepository(provider),
    browserSessionHandoffs: new BrowserSessionHandoffRepository(provider),
    cliAuthSessions: new CliAuthSessionRepository(provider),
    workSessions: new WorkSessionRepository(provider),
    workSessionEvents: new WorkSessionEventRepository(provider),
    workSessionCheckpoints: new WorkSessionCheckpointRepository(provider)
  }
}
