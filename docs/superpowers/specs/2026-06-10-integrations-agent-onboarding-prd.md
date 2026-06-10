# PRD: Relay Integrations, Personal Memory Agent, and Conversion Onboarding

Status: Draft for product/engineering review  
Owner: Relay  
Created: 2026-06-10  
Primary goal: turn Relay from an AI-chat memory utility into a cross-app personal/project memory layer with agentic actions and a conversion-focused onboarding funnel.

---

## 1. Executive summary

Relay already has strong foundations for project memory, MCP, external sources, and source-backed recall. The next major product leap is an integration layer that can bring real-life context from chat apps, email, calendar, work tools, and repositories into Relay silently but safely, then expose that context to:

1. Relay personal memory.
2. Relay project memory.
3. Ask Relay / Hermes-backed agent actions.
4. Claude, Codex, Cursor, and other MCP clients.
5. A better onboarding + upgrade funnel that demonstrates value quickly enough to convert users to paid.

The product should not be “a browser extension for AI sites.” It should become:

> Relay is the memory and context layer for your AI tools and agents. It remembers what matters across AI chats, work chats, email, calendar, docs, repos, and tasks — then helps you act on it.

The integration layer should be built separately from the current `project_sources` system. Current Sources are good for docs, repos, PDFs, websites, OpenAPI, and package docs. Integrations need OAuth, provider accounts, webhooks, sync cursors, event streams, permissions, action tools, and memory extraction policies.

---

## 2. Current repo findings

### 2.1 Existing strengths

Relay MCP already exposes a small, clean tool surface: `list_projects`, `set_current_project`, `get_brief`, `recall`, `sources`, and `save`. This is good because it keeps the agent prompt footprint low while hiding legacy internal tools.

Existing `sources` supports a complete lifecycle: list, resolve, index, status, read, search, context_pack, explore, grep, refresh, promote, import, delete, and purge.

Existing source storage has useful provenance structure:

- `project_sources`
- `source_versions`
- `source_chunks`
- `source_fact_candidates`
- `source_memory_links`

Existing source chunks already support text search and vector search.

Existing landing page already has a visually polished marketing structure:

- hero
- visual
- features
- how-it-works
- MCP section
- pricing
- FAQ
- bottom CTA

Existing analytics has canonical events for account creation, onboarding, project creation, extension connection, capture, billing, assistant, MCP, CLI, wizard, and milestones.

### 2.2 Main gaps

Current Sources are document/source oriented, not integration/event oriented. The current source kinds are effectively:

- uploaded file
- repo file
- external docs
- package docs

This is not enough for Gmail, Calendar, Slack, Telegram, WhatsApp, GitHub issues, Linear, Jira, Notion, etc.

Current source fact extraction is too heuristic for personal memory. It extracts the first long sentence and boosts confidence if the sentence contains words like “must,” “will,” “uses,” “stores,” “requires,” “decided,” “chosen,” “default,” “limit,” or “constraint.” That is acceptable for a prototype but risky for automatic personal memory.

Current landing copy is visually strong but not yet temptation-driven. It says “Stop repeating yourself to every AI,” but it does not sufficiently show the concrete before/after pain, the cross-app future, or the paid upgrade reason. Pricing copy focuses on reads/writes/projects rather than user outcomes.

---

## 3. External research summary

### 3.1 Slack

Slack integrations use Slack apps, OAuth scopes, and the Events API. Slack sends subscribed events to an HTTP endpoint or Socket Mode. Event visibility is tied to OAuth scopes and what the installing user/bot can see. Slack expects apps to acknowledge events quickly and process work asynchronously.

Implications for Relay:

- Build Slack as a server-side OAuth app, not browser extension capture.
- Use event subscriptions for channel messages, mentions, reactions, app home events, and DMs where permitted.
- Use separate read scopes and action scopes.
- Silent memory is possible only in channels/DMs where the app is installed and allowed to see messages.
- Agent actions can use `chat.postMessage`, thread replies, slash commands, app home, and interactive buttons.

References:

- https://docs.slack.dev/apis/events-api/
- https://docs.slack.dev/authentication/installing-with-oauth/

### 3.2 Telegram

Telegram bots can receive updates via long polling or HTTPS webhooks. In groups, Telegram bots run in Privacy Mode by default and only see commands, replies, inline messages, service messages, private chats, and channels where they are members. Privacy mode can be disabled, and bot admins can receive all group messages.

Implications for Relay:

- Telegram is the best first mobile-native capture surface.
- A Telegram bot can support `/remember`, `/ask`, forwarding messages, voice notes, and proactive reminders.
- Silent group memory is possible only if the bot is added to the group and has sufficient permissions/privacy mode settings.
- Relay should not promise silent capture of arbitrary private Telegram chats between other people unless the bot is actually a participant or the user forwards messages.
- Avoid unofficial MTProto/userbot scraping for MVP because it creates privacy, trust, and policy risk.

References:

- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/features#privacy-mode

### 3.3 WhatsApp

The official programmable route is WhatsApp Business Platform / Cloud API. It is designed for business accounts, customer messaging, and webhooks, not silent capture of a user’s personal WhatsApp chats.

Implications for Relay:

- WhatsApp should be later than Telegram/Slack/Gmail.
- Official WhatsApp support is best framed as “connect your WhatsApp Business conversations” or “forward/share to Relay,” not “silently capture all personal WhatsApp chats.”
- Browser extension capture for WhatsApp Web is technically possible but weak UX, not mobile-friendly, and likely brittle.

References:

- https://developers.facebook.com/docs/whatsapp/cloud-api/
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/

### 3.4 Gmail

Gmail supports push notifications via Google Cloud Pub/Sub and a `watch` request. Notifications include a mailbox `historyId`; the app then calls `history.list` to retrieve changes. Watches must be renewed periodically. Gmail scopes are sensitive and require careful consent, verification, and narrow access.

Implications for Relay:

- MVP should start with manual thread import + selected labels, not full inbox sync.
- Then add watch/history sync for selected labels.
- Keep read and send/draft permissions separate.
- Agent should draft first; sending requires explicit approval.

References:

- https://developers.google.com/workspace/gmail/api/guides/push
- https://developers.google.com/workspace/gmail/api/auth/scopes

### 3.5 Google Calendar

Calendar API authorization is scope-based. Google recommends choosing the most narrowly focused scope possible. Calendar supports read-only event scopes, free/busy scopes, and event write scopes.

Implications for Relay:

- Start with `calendar.events.readonly` or `calendar.freebusy` depending on feature.
- Use Calendar to infer deadlines, commitments, relationships, and meeting context, but promote to memory conservatively.
- Agent can create/edit events only after separate explicit permission and confirmation.

References:

- https://developers.google.com/workspace/calendar/api/auth

### 3.6 Notion

Notion supports internal connections, personal access tokens, and public OAuth connections. Workspace pages must be shared with the connection before API access works.

Implications for Relay:

- Use Notion as both a source and destination.
- OAuth/public connection is needed for SaaS users.
- Do not imply Relay can read all Notion workspace data by default; access is page/database scoped.
- Notion MCP shows the market direction: AI tools want authenticated workspace context.

References:

- https://developers.notion.com/guides/get-started/authorization
- https://developers.notion.com/guides/mcp/overview

### 3.7 GitHub

GitHub Apps provide installable app permissions and webhooks. GitHub recommends minimum permissions, webhook secrets, SSL verification, and selecting only the webhook events the app needs.

Implications for Relay:

- GitHub should be one of the first project-memory integrations.
- Use GitHub App installation, not user PATs.
- Ingest issues, PRs, review comments, discussions, commits, docs, and releases.
- Agent can draft issues/PR comments first; write actions require permissions and confirmation.

References:

- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app

### 3.8 Linear

Linear supports webhooks for created/updated/removed data across issues, issue comments, projects, documents, initiatives, cycles, customers, users, and more. Linear webhooks require HTTPS, fast 200 response, retries on failure, and signature verification with `Linear-Signature`.

Implications for Relay:

- Linear is a high-priority project memory integration.
- It maps cleanly to Relay project state, tasks, requirements, decisions, and roadmap memory.
- Use webhooks for event stream plus GraphQL for backfill/search.

References:

- https://linear.app/developers/webhooks

### 3.9 Jira

Jira Cloud supports webhooks for issue, comment, worklog, project, sprint, board, and other events. Webhooks can be filtered with JQL for supported event types, but broad webhooks can reveal sensitive information. Atlassian notes that new extensibility features are delivered through Forge rather than Connect.

Implications for Relay:

- Jira is enterprise/team integration, lower priority than Linear for current audience unless users ask.
- Use JQL/project filters aggressively.
- Respect team/admin approval requirements.

References:

- https://developer.atlassian.com/cloud/jira/platform/webhooks/
- https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/

### 3.10 Folk / getfolk-style agent pattern

folk positions itself as a CRM that captures relationship context and uses AI assistants to automate work. It explicitly markets assistants that scan email and WhatsApp conversations, detect follow-up timing, generate recaps, scan emails/notes/meetings/WhatsApp/LinkedIn activity, and automate email outreach. It also uses a conversion-focused landing page with direct email capture, team-size segmentation, social proof, ratings, security trust badges, and a trial CTA.

Implications for Relay:

- Relay can adapt the pattern, but for “AI memory + personal/project context,” not just CRM.
- The most powerful paid feature is not storage; it is proactive agentic value: follow-up suggestions, prep briefs, forgotten commitments, project next steps, and cross-app recall.
- Landing should show concrete workflows and outcomes, not just “cool memory.”

Reference:

- https://www.folk.app/

### 3.11 Anthropic Fable 5

Anthropic’s model docs list Claude Fable 5 (`claude-fable-5`) as its most capable widely released model, with 1M context and 128k max output. The docs say it became generally available on June 9, 2026, on Claude API and cloud platforms.

Implications for Relay:

- Use Fable 5 for high-value internal product/engineering tasks first: PRD refinement, onboarding copy variants, landing-page audits, integration adapter architecture, and memory extraction evaluation.
- Do not make Fable 5 the default runtime agent model immediately because it is expensive. Use it as a premium/high-quality mode or offline evaluator.

Reference:

- https://platform.claude.com/docs/en/about-claude/models/overview

---

## 4. Product thesis

Relay should become a cross-app memory and agent infrastructure product.

### Current perception

“Cool tool that saves context from AI chats.”

### Desired perception

“Relay remembers my work and life context across tools, then lets any AI or agent continue from the truth.”

### New product promise

> Connect your chats, email, calendar, docs, repos, and tasks. Relay quietly builds your personal and project memory, then your AI tools and Relay Agent can use it to answer, prepare, remind, summarize, and act.

---

## 5. Goals

### 5.1 Product goals

1. Add a real Integrations layer separate from Sources.
2. Support silent-but-consented chat memory from Telegram and Slack first.
3. Support Gmail and Calendar context for personal memory and agent actions.
4. Support GitHub and Linear for project memory.
5. Make Ask Relay / Hermes-backed agent capable of using integrations as tools.
6. Improve landing + onboarding so users reach a value moment before dropping.
7. Create clear upgrade triggers tied to integrations, proactive agent actions, and history/automation limits.

### 5.2 Business goals

1. Increase visitor-to-signup conversion.
2. Increase signup-to-activation conversion.
3. Increase activation-to-paid conversion.
4. Make Starter/Pro upgrade reasons obvious.
5. Reduce reliance on “cool demo” excitement by creating a concrete recurring use case.

### 5.3 Non-goals

1. Do not silently scrape arbitrary private Telegram or WhatsApp user chats outside official participant/forwarding/business mechanisms.
2. Do not build a generic Zapier clone.
3. Do not store raw personal communication as memory by default.
4. Do not allow autonomous high-impact actions without approval.
5. Do not make browser extension the integration hub.

---

## 6. Target users and jobs-to-be-done

### 6.1 AI power user / builder

Pain: repeats project context to Claude/Codex/ChatGPT, loses decisions across chats, forgets what was decided.  
Value: project memory from GitHub/Linear/AI chats/docs, available via MCP and Relay Agent.  
Paid trigger: more projects, source-backed recall, GitHub/Linear sync, proactive project brief.

### 6.2 Founder / operator / student

Pain: commitments scattered across Telegram, email, calendar, AI chats, notes.  
Value: personal memory + reminders + prep summaries.  
Paid trigger: Gmail/Calendar/Telegram integrations, proactive follow-up and prep agent.

### 6.3 Sales/relationship-heavy user

Pain: forgets follow-ups, context scattered in Gmail/WhatsApp/LinkedIn/Calendar.  
Value: folk-like personal relationship memory and follow-up agent.  
Paid trigger: proactive follow-up assistant, CRM-like recaps, contact memory.

### 6.4 Team/project user

Pain: decisions and tasks split between Slack/Linear/GitHub/Jira/Notion.  
Value: source-grounded project memory that updates silently and answers “why did we decide this?”  
Paid trigger: team integrations, audit trail, roles, higher limits.

---

## 7. Core product surfaces

### 7.1 Integrations dashboard

A new dashboard section that shows:

- Connected accounts.
- Provider status.
- Last sync time.
- Granted scopes.
- Read vs write permissions.
- What is being watched.
- Memory extraction mode.
- Raw source retention policy.
- Approval queue count.
- Agent action permissions.

### 7.2 Memory inbox

A review queue for extracted candidates:

- Personal memory candidates.
- Project memory candidates.
- Tasks/reminders.
- Conflicts/updates to old memory.
- Rejected/ignored items.
- “Why was this suggested?” with citations/source links.

### 7.3 Telegram Relay bot

MVP commands:

- `/remember [text]`
- `/ask [question]`
- `/project [name]`
- `/save_to_project [project]`
- `/daily` or `/brief`
- Forward message to bot => create memory candidate.
- Voice note => transcribe/summarize/candidate.

Silent mode for groups:

- User adds bot to group.
- Bot explains visible privacy state and what it can/cannot see.
- User chooses “observe all messages,” “only messages mentioning Relay,” or “only forwarded/saved messages.”
- Observed messages become observations, not memories.

### 7.4 Slack Relay app

MVP features:

- Add Relay to selected channels.
- Slash command `/relay remember`.
- Emoji/reacji save, e.g. `:relay:`.
- App home with recent candidates.
- Thread summary to project memory.
- Ask Relay in DM or thread.

### 7.5 Gmail + Calendar connectors

MVP Gmail:

- Manual thread import.
- Selected label sync.
- Summarize selected thread.
- Extract follow-up/commitment candidates.
- Draft reply with approval.

MVP Calendar:

- Read upcoming events.
- Generate prep brief using memory + related sources.
- Extract recurring commitments and important people only with confirmation.
- Create event only after explicit permission.

### 7.6 GitHub + Linear connectors

GitHub:

- Repo install via GitHub App.
- Import README/docs as sources.
- Ingest issues/PRs/comments/releases as integration objects.
- Memory candidates for decisions, constraints, tasks, bugs, and shipped artifacts.

Linear:

- OAuth install.
- Sync issues/projects/comments/project updates.
- Roadmap memory candidates.
- Agent can draft/update issues with confirmation.

### 7.7 Ask Relay / Hermes-backed agent

Agent should use Relay memory and integration tools:

- Search personal memory.
- Search project memory.
- Search sources.
- Search integration objects.
- Read Gmail thread.
- Read calendar context.
- Draft email.
- Create calendar event.
- Create/update Linear issue.
- Create GitHub issue/PR comment.
- Send Telegram/Slack message.

The agent should be permissioned by capability:

- read-only
- draft-only
- write-with-confirmation
- autonomous low-risk
- never autonomous

---

## 8. Information architecture

### 8.1 Keep Sources and Integrations separate

Current Sources should remain for document-like knowledge:

- docs
- PDFs
- repositories/docs
- external pages
- package docs
- OpenAPI
- arXiv
- uploaded files

New Integrations should model accounts, events, objects, permissions, sync, and action tools.

### 8.2 Proposed database tables

```sql
integration_accounts (
  id uuid primary key,
  user_id text not null,
  provider text not null,
  account_label text,
  external_account_id text,
  auth_type text not null,
  scopes text[] not null,
  status text not null,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'
);

integration_objects (
  id uuid primary key,
  account_id uuid not null references integration_accounts(id),
  provider text not null,
  external_id text not null,
  object_type text not null,
  project_id uuid references projects(id),
  personal_project_id uuid references projects(id),
  title text,
  source_uri text,
  occurred_at timestamptz,
  updated_external_at timestamptz,
  payload_hash text,
  visibility text not null default 'private',
  raw_metadata jsonb not null default '{}',
  unique(account_id, external_id)
);

integration_events (
  id uuid primary key,
  account_id uuid not null references integration_accounts(id),
  object_id uuid references integration_objects(id),
  provider text not null,
  event_type text not null,
  external_event_id text,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  payload_hash text,
  raw_payload jsonb,
  processing_status text not null default 'pending'
);

integration_observations (
  id uuid primary key,
  object_id uuid not null references integration_objects(id),
  project_id uuid references projects(id),
  personal_project_id uuid references projects(id),
  content text not null,
  observed_at timestamptz not null,
  confidence real not null default 0.5,
  sensitivity text not null default 'normal',
  extraction_status text not null default 'pending',
  metadata jsonb not null default '{}'
);

integration_action_grants (
  id uuid primary key,
  account_id uuid not null references integration_accounts(id),
  action_name text not null,
  permission_mode text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 8.3 Normalized object types

Personal memory-oriented:

- `chat_message`
- `chat_thread`
- `email_thread`
- `calendar_event`
- `contact`
- `relationship_note`

Project memory-oriented:

- `github_issue`
- `github_pr`
- `github_commit`
- `linear_issue`
- `linear_project`
- `jira_issue`
- `notion_page`
- `slack_thread`

### 8.4 Observation vs memory

Do not save raw chat/email/calendar facts directly as memory.

Pipeline:

```text
integration event
→ integration object
→ observation
→ memory candidate
→ promote/update/archive/reject
→ active memory item
```

This preserves trust and avoids polluting memory.

---

## 9. Memory extraction policy

### 9.1 Personal memory categories

- identity
- stable preference
- goal
- commitment
- relationship
- recurring routine
- project involvement
- deadline
- health/safety note
- location/timezone
- important life context

### 9.2 Project memory categories

- decision
- requirement
- constraint
- architecture
- task
- bug
- shipped artifact
- open question
- dependency
- integration config

### 9.3 Auto-save rules

Auto-save only if all are true:

1. High confidence.
2. Low sensitivity.
3. Durable beyond the current conversation.
4. Not a raw secret, credential, or private third-party detail.
5. Not contradicted by existing memory unless updating/archiving old memory.
6. User has enabled auto-save for that provider/scope.

Otherwise create a candidate.

### 9.4 Silent capture policy

“Silent” must mean silent UI/no manual work, not hidden or non-consensual capture.

Rules:

- The user must explicitly connect the integration.
- Relay must show what it can see.
- Relay must expose pause/delete controls.
- Relay must not store raw sensitive conversations longer than needed unless user opts in.
- For group/team chats, indicate bot/app presence according to platform norms.
- For messages involving other people, save only derived memory about the user/project unless it is explicitly project/team context.

---

## 10. Agent requirements

### 10.1 Agent architecture

The agent should use Relay as its memory and tool-governance layer.

```text
User request
→ agent planner
→ Relay memory/source/integration retrieval
→ tool selection
→ action risk classification
→ draft/confirm/execute
→ audit log
→ memory update/candidate
```

### 10.2 Agent tool classes

Read tools:

- search personal memory
- search project memory
- search source chunks
- search integration objects
- read calendar events
- read selected Gmail thread
- read Slack/Telegram/Linear/GitHub context where allowed

Draft tools:

- draft email
- draft calendar event
- draft Slack/Telegram reply
- draft Linear issue/update
- draft GitHub issue/comment

Write tools:

- send email
- create event
- send chat message
- create/update issue
- save/promote memory

### 10.3 Action gating

Default policy:

- Reading: allowed after integration permission.
- Drafting: allowed after integration permission.
- Sending/writing: confirm every time at MVP.
- Autonomous writes: only later for low-risk actions and paid users.

### 10.4 Agent use cases

1. “What should I follow up on today?”
2. “Prepare me for my meeting with X.”
3. “What did we decide about Relay integrations?”
4. “Create Linear tickets from this GitHub PR discussion.”
5. “Summarize the last week of Telegram project group discussion.”
6. “Draft a reply to this Gmail thread using my memory.”
7. “What tasks did I promise in Slack/Telegram/Gmail?”

---

## 11. Onboarding and conversion PRD

### 11.1 Current problem

Users think Relay is cool, but the landing page does not make the value feel inevitable or urgent enough to sign up/pay. It communicates “context management” rather than “you are losing hours and opportunities because your AI and tools forget everything.”

### 11.2 New funnel hypothesis

Users convert when they experience one of these value moments:

- Relay remembers a real thing they would have repeated.
- Relay produces a useful project brief from existing material.
- Relay catches a follow-up/task/commitment from chat/email/calendar.
- Relay makes Claude/Codex better with context.
- Relay shows a personal/project memory graph that feels uniquely theirs.

### 11.3 Landing page repositioning

Current hero:

> Stop repeating yourself to every AI

Stronger variants to test:

1. “Your AI tools finally remember your work.”
2. “One memory layer for ChatGPT, Claude, Codex, Gmail, Calendar, and Telegram.”
3. “Relay remembers what your AI, chats, and projects forget.”
4. “Give every AI the context it needs — automatically.”
5. “Turn scattered chats, docs, emails, and repos into memory your AI can use.”

Recommended initial hero:

> Your AI tools finally remember your work.

Subheadline:

> Relay quietly captures the decisions, tasks, preferences, and project context scattered across AI chats, Telegram, Gmail, Calendar, GitHub, Linear, and docs — then gives that memory to Claude, Codex, ChatGPT, and your Relay Agent.

Primary CTA:

> Build my memory

Secondary CTA:

> See how it works

### 11.4 Landing page sections to add/change

1. Pain-first section:
   - “Every new chat starts from zero.”
   - “Your commitments live in five apps.”
   - “Your AI forgets decisions after every session.”

2. Demo-first section:
   - input: AI chat + GitHub issue + calendar event
   - output: project brief + memory + next action

3. Integrations strip:
   - ChatGPT, Claude, Codex, Cursor, Telegram, Gmail, Calendar, GitHub, Linear, Slack, Notion.

4. Agent section:
   - “Ask Relay what you promised.”
   - “Prepare for meetings.”
   - “Draft follow-ups.”
   - “Create tasks from project discussions.”

5. Trust section:
   - read/write separation
   - source citations
   - audit log
   - delete/forget controls
   - encryption/security claims only if true

6. Upgrade reason section:
   - Free: try memory with AI chats.
   - Starter: connect real integrations and keep long-term memory.
   - Pro: proactive agent + more automations + higher-quality model.

### 11.5 Personalized onboarding flow

New onboarding should ask only enough to personalize the first value moment.

Step 1: “What do you want Relay to remember?”

Choices:

- My AI coding/project work.
- My personal commitments and chats.
- My sales/relationships/follow-ups.
- My team/project decisions.

Step 2: “Where is your context today?”

Choices based on Step 1:

- AI chats: ChatGPT / Claude / Cursor / Codex
- Work: GitHub / Linear / Slack / Notion / Jira
- Personal: Telegram / Gmail / Calendar
- Sales: Gmail / Calendar / WhatsApp / LinkedIn / CRM

Step 3: “Create first memory from real context.”

Options:

- Install extension.
- Connect Telegram bot.
- Connect GitHub repo.
- Connect Gmail/Calendar.
- Paste or upload a conversation/document.

Step 4: “Instant payoff.”

Generate one of:

- Project brief.
- Personal memory preview.
- Follow-up list.
- Meeting prep brief.
- Context pack for Claude/Codex.

Step 5: Upgrade prompt only after value.

Examples:

- “Connect more than one integration with Starter.”
- “Keep memory longer than 14 days with Starter.”
- “Let Relay proactively detect follow-ups with Pro.”
- “Use Fable/advanced model for high-quality memory extraction with Pro.”

### 11.6 Pricing copy change

Current pricing features are too quota-oriented: reads/writes/projects. Keep details in compare page, but the cards should sell outcomes.

Free:

- Try Relay memory with AI chats.
- 2 projects.
- 14-day memory history.
- Browser capture + MCP taste.

Starter:

- Long-term memory across projects.
- Connect integrations.
- Source-backed recall.
- Enough usage for daily AI work.

Pro:

- Proactive Relay Agent.
- More connected sources.
- Higher-quality extraction/model.
- Automation-heavy workflows.

---

## 12. Analytics PRD

### 12.1 Activation milestones

Core activation:

- `first_memory_saved`
- `first_project_created`
- `first_context_recalled`
- `first_brief_generated`
- `first_integration_connected`
- `first_integration_observation_created`
- `first_memory_candidate_promoted`
- `first_agent_action_drafted`
- `first_agent_action_executed`

Conversion milestones:

- `paywall_viewed`
- `upgrade_clicked`
- `checkout_started`
- `checkout_completed`
- `subscription_activated`

### 12.2 Funnel definitions

Visitor funnel:

```text
landing_viewed
→ hero_cta_clicked
→ signup_started
→ account_created
→ onboarding_viewed
→ onboarding_persona_selected
→ first_context_source_selected
→ first_value_generated
→ activation_completed
→ paywall_viewed
→ checkout_started
→ checkout_completed
```

Integration funnel:

```text
integration_card_viewed
→ integration_connect_clicked
→ oauth_started
→ oauth_completed
→ sync_started
→ sync_completed
→ first_observation_created
→ first_candidate_created
→ first_candidate_promoted
→ integration_value_moment_completed
```

Agent funnel:

```text
agent_opened
→ agent_message_sent
→ agent_tool_used
→ agent_action_drafted
→ action_confirmation_shown
→ action_confirmed
→ action_executed
→ memory_updated_from_action
```

Upgrade funnel:

```text
limit_reached OR premium_feature_clicked OR proactive_agent_teaser_clicked
→ paywall_viewed
→ plan_selected
→ checkout_started
→ checkout_completed
→ subscription_state_changed
```

### 12.3 Properties to attach to events

- `persona`
- `use_case`
- `provider`
- `integration_type`
- `permission_mode`
- `source_surface`
- `project_id`
- `memory_scope`: personal/project
- `candidate_count`
- `promoted_count`
- `model_used`
- `plan`
- `experiment_variant`
- `value_moment_type`
- `paywall_reason`

### 12.4 Metrics

North-star metric:

> Weekly active users who successfully use Relay memory in another AI/tool or agent action.

Supporting metrics:

- Visitor-to-signup conversion.
- Signup-to-first-value conversion.
- First-value-to-paid conversion.
- Integration connection rate.
- Memory candidate promotion rate.
- Recall success rate.
- Agent action completion rate.
- Paid conversion by persona.
- Time to first value.
- Paywall conversion by paywall reason.

---

## 13. Monetization and packaging

### 13.1 Recommended packaging

Free:

- Extension capture.
- MCP read/write taste.
- 1 external source.
- 1 integration trial OR limited Telegram bot.
- 14-day history.

Starter:

- Long-term personal/project memory.
- Telegram + GitHub + Calendar/Gmail basic.
- Source-backed recall.
- More projects/sources.
- Daily Ask Relay.

Pro:

- Proactive agent.
- Gmail/Calendar deeper sync.
- Slack/Linear/Jira/Notion advanced.
- Higher-quality extraction model.
- More automations.
- Team/export/audit features later.

### 13.2 Upgrade triggers

- Connect second integration.
- Need long-term memory beyond retention.
- Proactive follow-up detection.
- More than N memory candidates/day.
- Agent wants to execute an action.
- Source-backed recall quota hit.
- More projects/sources.

---

## 14. MVP roadmap

### Phase 0: foundation and funnel, 1-2 weeks

- Add `integrations` conceptual docs and DB migration draft.
- Add analytics events for integration and funnel milestones.
- Redesign landing hero copy and pricing outcome copy.
- Add personalized onboarding persona step.
- Add “first value” generation from pasted AI chat/source before asking for deeper setup.
- Add Fable 5 evaluation workflow for copy/PRD/extraction tests.

### Phase 1: Telegram + GitHub/Linear project memory, 2-4 weeks

- Telegram bot private chat.
- Forward/save message to personal memory candidate.
- `/ask` personal/project recall.
- GitHub App MVP: repo install, issues/PRs/comments webhook, README/docs source ingest.
- Linear OAuth/webhook MVP.
- Memory candidate inbox.

### Phase 2: Gmail/Calendar, 3-5 weeks

- Google OAuth.
- Calendar read-only sync.
- Gmail manual thread import.
- Gmail selected label sync.
- Meeting prep brief.
- Follow-up candidate detection.

### Phase 3: Agent actions, 3-6 weeks

- Hermes-backed agent tool registry.
- Draft email.
- Draft calendar event.
- Draft Linear/GitHub task.
- Confirmation UI.
- Action audit log.
- Paid upgrade gate for proactive/daily agent.

### Phase 4: Slack/Notion/Jira and stronger automations

- Slack event subscriptions.
- Notion OAuth/page sync.
- Jira OAuth/webhook.
- Proactive daily briefing.
- Follow-up assistant.
- Relationship/person graph.

### Phase 5: WhatsApp

- WhatsApp Business Platform support.
- Forward/share workflow for personal users.
- Consider WhatsApp Web extension only if strong demand and acceptable policy risk.

---

## 15. Technical requirements

### 15.1 Security

- Encrypt provider tokens at rest.
- Store provider scopes and permission state.
- Webhook signature verification.
- Replay protection.
- Idempotency keys based on provider event IDs and payload hashes.
- Raw payload retention limits.
- Delete/disconnect provider path.
- Audit log for agent actions.

### 15.2 Privacy

- Explicit consent for each integration.
- Clear “what Relay can see” UI.
- Pause/resume capture.
- Delete raw integration objects.
- Forget promoted memory.
- For chat integrations, group/team consent constraints.
- Sensitive data detector before memory promotion.

### 15.3 Reliability

- Queue event processing.
- Fast webhook ACK.
- Retry with backoff.
- Dead-letter queue.
- Sync cursors.
- Backfill jobs.
- Provider rate-limit handling.

### 15.4 Cost

- Do not run expensive model extraction on every raw message.
- Batch low-priority extraction.
- Use cheaper model/rules for triage.
- Use Fable 5 only for high-value extraction/evaluation/premium mode.
- Store embeddings only for promoted/candidate objects or summarized chunks, not every raw chat line.

---

## 16. Fable 5 experiment plan

### 16.1 Product/copy tasks

Use Fable 5 to generate:

- 20 hero variants by persona.
- 10 onboarding flows.
- 10 paywall reason variants.
- Landing section rewrites.
- Pricing outcome copy.

Evaluate with:

- clarity
- urgency
- specificity
- trust
- paid motivation
- developer credibility

### 16.2 Engineering tasks

Use Fable 5 to draft:

- provider adapter interface.
- DB migration plan.
- extraction prompt suite.
- threat model.
- test cases.
- memory candidate classifier.

### 16.3 Extraction benchmark

Create a small labeled dataset:

- 50 Telegram-style chats.
- 50 Gmail threads.
- 50 Calendar event sets.
- 50 GitHub/Linear threads.
- 50 AI project chats.

Labels:

- should save to personal memory?
- should save to project memory?
- should create task?
- should ignore?
- sensitivity level?
- contradiction/update?

Compare:

- current heuristic.
- cheap model.
- strong current production model.
- Fable 5.

---

## 17. Risks and mitigations

### 17.1 Privacy backlash

Risk: Users dislike “silent chat memory.”  
Mitigation: Use “silent after consent,” clear controls, memory inbox, no raw auto-save, delete/forget controls.

### 17.2 WhatsApp limitations

Risk: Users expect personal WhatsApp sync.  
Mitigation: Be honest. Start with Telegram/Slack/Gmail/Calendar. Position WhatsApp Business and forwarding separately.

### 17.3 OAuth verification delays

Risk: Gmail/Calendar scopes require verification and user trust.  
Mitigation: Start narrow, manual import, read-only, selected labels, clear privacy policy.

### 17.4 Memory pollution

Risk: Auto-extracted memories become noisy/wrong.  
Mitigation: Observations first, review queue, conservative promotion, contradiction detection.

### 17.5 Agent action safety

Risk: Agent sends wrong email/message.  
Mitigation: Draft-first, confirmation gates, audit logs, rollback where possible.

### 17.6 Cost explosion

Risk: Chat/event streams create too much inference and embedding work.  
Mitigation: batch summaries, thresholding, provider filters, daily digestion, paid gates.

---

## 18. Open questions

1. Should personal memory be a default project or a separate top-level object in UI?
2. How much raw integration text should Relay retain after extracting memory?
3. Should Telegram group silent mode require admin setup or allow per-user forwarding only first?
4. Should Starter include integrations or should most integrations be Pro?
5. Should Relay Agent be a separate paid feature or included with usage limits?
6. Which provider should be first public integration: Telegram, GitHub, or Gmail/Calendar?
7. Should Relay position itself more as “AI memory” or “personal AI agent memory layer”?
8. What is the first paid aha moment: cross-AI context, proactive follow-up, or project memory?

---

## 19. Recommended immediate next steps

1. Update landing hero and pricing outcome copy.
2. Add onboarding persona step and first-value generation.
3. Add analytics events for integration/funnel milestones.
4. Build integration DB foundation.
5. Build Telegram bot MVP.
6. Build GitHub App MVP for project memory.
7. Build memory candidate inbox.
8. Use Fable 5 as evaluator/copy/architecture assistant, not default runtime.

---

## 20. Success criteria

Within 30 days of launch:

- 30%+ of signed-up users reach first value.
- 20%+ of activated users connect at least one integration.
- 10%+ of activated users promote at least one memory candidate.
- 5%+ of activated users start checkout or hit a meaningful paywall.
- Median time to first value under 3 minutes.
- At least one integration flow produces a clearly repeatable paid use case.

Within 90 days:

- Starter conversion driven by integrations and long-term memory.
- Pro conversion driven by proactive agent actions.
- Telegram/GitHub/Calendar/Gmail become top activation surfaces.
- Relay can truthfully claim: “memory across AI chats, docs, repos, email, calendar, and Telegram.”
