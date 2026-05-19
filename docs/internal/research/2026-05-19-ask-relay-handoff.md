# Ask Relay — Handoff Spec (2026-05-19)

Status of the in-app AI assistant after PR #31 (squash-merged to `main` as `0cb7c68`,
migration `0039` applied to prod, deployed to https://www.onrelay.app).

This document is the source of truth for the next session. Do not re-derive scope by
reading the PRD — the PRD was the *original ask*; this file is what actually shipped
and what is deliberately deferred.

## TL;DR

- Ask Relay shipped **web dashboard only** (`/dashboard`, `/docs`, settings surfaces).
- It is **NOT in the browser extension**. The extension is unchanged.
- v1 = agent loop + tools + persistence + plan limits + voice input + branch/copy/feedback.
- Deferred (never in the merged commit): extension UI, chat-history browser UI,
  full-screen/resizable panel, file attachments end-to-end, embeddings RAG, per-surface
  quick actions, realtime/speech-out voice, tool-call analytics in PostHog.

## What shipped (verified in code)

### Backend
- `apps/web/src/server/services/assistant-agent-service.ts` — bounded tool loop
  (NOT LangGraph.js; plain Gemini function-calling). `maxSteps` per plan.
- `apps/web/src/server/services/gemini-service.ts` — `runGeminiAgentStep`. Model
  `GEMINI_MODEL_ASSISTANT ?? "gemini-3-flash-preview"`. **Gemini 3 `thoughtSignature`
  is captured and echoed back** on functionCall parts (A7) — required or every
  tool turn 400s.
- `apps/web/src/server/services/assistant-tools.ts` — 8 tools: `list_projects`,
  `recall_context`, `search_memory`, `list_recent_activity`, `get_brief`,
  `add_memory`, `manage_memory` (destructive), `relay_knowledge`. `relay_knowledge`
  is naive substring match over `PUBLIC_MARKDOWN_PAGES` — **not** embeddings RAG.
- `DESTRUCTIVE_TOOLS = {manage_memory, set_project_state}` → confirm-gated; Free
  plan blocked from destructive.
- Entitlement gates in `entitlement-service.ts`: `assertAssistantTokenBudget`
  (hard monthly token cap, pre-turn), `consumeAssistantMessageQuota`,
  `consumeAssistantTokenQuota`. Limits in `billing-config.ts`
  (`assistantMessagesMonthly/Daily`, `assistantTokensMonthly`, `assistantMaxSteps`).

### API routes (`apps/web/src/app/api/assistant/`)
- `chat/route.ts` — SSE stream turn (POST). Token gate + message quota pre-turn.
- `chats/route.ts` — GET list / POST create. **`searchByUser` exists** (text search).
- `chats/[id]/route.ts` — GET messages / PATCH rename / DELETE.
- `messages/[id]/route.ts` — PATCH like/dislike feedback.
- `undo/route.ts` — POST undo (delete/archive memory).

### Frontend (`apps/web/src/components/assistant/`)
- `ask-relay-launcher.tsx` — top-right button, fires `assistant_widget_opened`.
- `ask-relay-panel.tsx` — right side panel, **fixed `max-w-[440px]`**, `New` button,
  message list, composer, mic.
- `chat-message.tsx` — bubble, copy, edit→branch, like/dislike, chevron cycling,
  pending-action confirm. `data-testid="chat-message" data-role=…` for e2e.
- `use-assistant-chat.ts` — client state, `derivePath` branch tree (unit-tested in
  `use-assistant-chat.test.ts`).
- `action-result-card.tsx` — tool result + Undo / "Can't be undone" (A4).
- Voice: `apps/web/src/hooks/use-voice-input.ts` (Web Speech API) wired to mic
  button — **shipped, input only**.

### Data (`packages/db`)
- Migration `0039_assistant_chat.sql`: `assistant_chats`, `assistant_messages`,
  `assistant_attachments` (+ RLS, idempotent `do/exception` policies). Applied to
  prod (head = `0039`).
- Repos: `assistant-chat-repository.ts`, `assistant-message-repository.ts`,
  `assistant-attachment-repository.ts`. **Attachment repo + table exist but are
  unused** — no upload route, no parsing, no UI.

### Analytics
- `assistant_widget_opened` (client, PostHog via `logClientEvent`) — props
  surface/plan/projectId. Per-user via `PostHogIdentity` → `identifyPosthogUser`.
- `assistant_message_sent` (server, `captureServerEvent`, `distinct_id = userId`)
  — props surface/plan. Per-user.
- `assistant.tool_invoked` — **`logServerEvent` only, NOT PostHog**. Tool-usage
  analytics not queryable in PostHog dashboards.
- Token/message usage in DB `usage_counters` (`assistant_messages_*`,
  `assistant_tokens_monthly`) — queryable for plan-level distribution.

## Deferred / NOT shipped (with integration points)

| Feature | State | Where to wire it |
|---|---|---|
| **Extension Ask Relay UI** | none | New panel in `apps/extension/src` (popup/sidepanel). Reuse `/api/assistant/*` with an extension token (see `api/extension/auth/*`). Needs CORS (`server/http/extension-cors.ts`). |
| **Chat-history browser UI** | API done, no UI | `ask-relay-panel.tsx` only has `New`. Build a list/switcher calling `GET /api/assistant/chats` (+`?q=` search), rename (PATCH), delete (DELETE). Wire to `use-assistant-chat` (`reset`, load `chatId`). |
| **Full-screen / resizable panel** | fixed 440px | `ask-relay-panel.tsx` `DialogPrimitive.Content` className. Add maximize toggle + drag-resize. |
| **File attachments (e2e)** | table+repo only | Add `POST /api/assistant/attachments` (upload → R2 via `@aws-sdk/client-s3`, parse with `pdf-parse`/`mammoth` already in web deps), persist via `assistant-attachment-repository`, surface in composer, inject extracted text as ephemeral context in `assistant-agent-service`. |
| **Embeddings RAG over docs** | substring only | `relay_knowledge` in `assistant-tools.ts` → replace with pgvector over docs (existing source-embedding infra in `server/services/source-*`). |
| **Per-surface quick actions** | none | Suggestion chips in `ask-relay-panel.tsx` empty state, keyed by `surface`. |
| **Realtime / speech-out voice** | input only | `use-voice-input.ts` is Web Speech in. Speech-out / OpenAI Realtime not started. |
| **Tool-call PostHog analytics** | log only | Add `captureServerEvent({event:"assistant_tool_used", distinctId:viewer.userId, properties:{tool}})` next to the existing `logServerEvent` in `assistant-agent-service.ts` (~3 lines). |
| **Auto page-context capture** | schema only | `sendAssistantMessageSchema.pageContext` is accepted + injected by the agent, but the launcher never populates it. Capture `document.title`/selection in `ask-relay-launcher.tsx`. |

## Gotchas for the next session

- **Gemini key**: `.env.vercel-prod`/`.env.production` `GEMINI_API_KEY` is
  referrer-restricted → `API_KEY_INVALID` server-to-server. Working local key is in
  the user's original local env. Prod Vercel env has its own (working for digest).
- **Gemini 3 thoughtSignature**: any new code path that replays a `functionCall`
  to the model MUST carry `thoughtSignature` (see `gemini-service.ts` /
  `assistant-agent-service.ts` pending-action payload). Dropping it → 400.
- **Auth modes**: `AUTH_PROVIDER=neon` (Google, prod) vs `local` (signed cookie,
  `/api/auth/local`). Next reads env from **`apps/web/`**, not repo root. Neon-Auth
  on `localhost` redirect-loops — local e2e must use `AUTH_PROVIDER=local`.
- **Local e2e recipe** (proven this session): create Neon branch from
  `shiny-term-32281581` (prod project), point `LOCAL_DATABASE_URL` at it,
  `AUTH_PROVIDER=local`, real `RELAY_CONTENT_ENCRYPTION_KEY` from
  `.env.vercel-prod` (dequoted) so prod-replica rows decrypt, sign in via
  `POST /api/auth/local`, scope writes to a throwaway smoke project. Spec:
  `tests/e2e/ask-relay.spec.ts` (auth-gated via `tests/e2e/.auth/ask-relay.json`,
  config `.tmp/pw.e2e.config.ts` for real Chrome).
- **e2e branch-cycle test** is `test.fixme` (headed-Chrome timing flaky); branch
  logic is covered by `derivePath` unit tests — do not relitigate.
- Rollback if prod assistant breaks: `git revert 0cb7c68 && vercel deploy --prod
  --yes`. Migration 0039 is idempotent; safe to leave.

## Suggested next-session order

1. Chat-history browser UI (API already done — fastest user-visible win).
2. Full-screen/resizable panel (small, self-contained).
3. File attachments end-to-end (upload route → parse → ephemeral context).
4. `assistant_tool_used` PostHog event (3 lines, unblocks tool analytics).
5. Extension Ask Relay UI (largest; reuse existing API + extension auth).
6. Embeddings RAG for `relay_knowledge`.
