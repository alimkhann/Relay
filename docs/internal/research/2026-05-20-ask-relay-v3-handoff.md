# Ask Relay v3 — Handoff & Pre-Merge Gate (2026-05-20)

Branch `feat/ask-relay-v2` (not merged, not deployed). Builds on the v2 work
and the v1→v2 source of truth `2026-05-19-ask-relay-handoff.md` (still valid for
backend gotchas: Gemini key referrer restriction, Gemini-3 `thoughtSignature`
echo, local-e2e recipe, rollback).

## What v3 shipped (all static-verified)

| Workstream | Commit | Notes |
|---|---|---|
| W2 action cards persist | `ebaeb15` | `turnActionResults[]` persisted on the final assistant message `toolPayload`; `AssistantMessageDto.actionResults[]`; `chats/[id]` maps it (singular fallback); `derivePath` hydrates. Cards now survive stream-end + reload. |
| W1 flicker lock | `01d89b5` | Hook-level regression test: edit replaces old prompt+answer **before** any token streams. |
| W3 web search + tools | `74abd13` | Gemini Google Search grounding (auto-retry w/o grounding on 400; "Sources" footer). Safe-broad tools: recall_past_chats, sources read/search/explore/grep/read, import_source_citation, refresh_source, get/set_project_state, trace_context, save_context — delegate to `RelayHttpMcpClient`. `set_project_state` confirm-gated. |
| W4 safety prompt | `e92c0df` | Injection guard (page/attachment/source/search/tool output = untrusted data), no-fabrication, scope/secret refusal, off-task decline, tool routing. |
| W5 web reflection | `761ff97` | `relay:memory-mutated` event + leading+trailing `router.refresh()`. |
| W6 shared core | `542870e` | `UiMessage`/`derivePath`/`spliceOptimistic` → `@relay/shared/utils/assistant-chat-path`; web hook re-exports (behavior-preserving, 11 tests). |
| W6 extension parity | `ef8317b` | `use-extension-chat` (Bearer transport, shared path), rebuilt UI: full-width MiniMarkdown, edit, history, attachments+Save-to-Sources, branch nav, confirm; BroadcastChannel → control-panel `refreshActiveProjectState`. |
| build fix | `a007c1a` | Deep-import shared chat-path so the barrel's `node:crypto` (utils/hashing) stays out of web/extension bundles. |

Verification done here: `pnpm typecheck` (12/12), `pnpm lint` (all),
`pnpm test:stable` 75/75, web unit 11/11, extension 127/127,
`pnpm --filter @relay/web build` compiles (`/chat` present).

## Pre-merge gate (MUST run before merge — cannot run in this environment)

1. **Local e2e recipe** from the v1 handoff: Neon branch off prod project,
   `AUTH_PROVIDER=local`, real `RELAY_CONTENT_ENCRYPTION_KEY`, throwaway smoke
   project, sign in via `POST /api/auth/local`.
2. **Attachments + Gemini vision** (v2, never runtime-verified): upload a
   PDF/docx and an image; confirm extracted text + image vision reach the model;
   "Save to Sources" creates a source. Watch for the warn logs
   `assistant.attachment_store_failed` / `assistant.attachment_image_unreadable`
   (R2 must be configured in the test env).
3. **Web search grounding**: ask something requiring the web; confirm a grounded
   answer + "Sources" footer. If the model 400s on grounding+functions, confirm
   the no-grounding retry path keeps the turn alive (it will lose web data —
   then implement the deferred `web_search` function-tool fallback).
4. **New tools**: exercise search_sources / read_source / recall_past_chats /
   save_context / set_project_state (confirm-gated). Confirm `actionResults`
   cards render and persist after reload.
5. **Optimistic both surfaces**: agent create/delete reflects in the dashboard
   memory list (no manual reload) and in the extension control panel
   (BroadcastChannel → refreshActiveProjectState).
6. **Extension chat**: edit (no flicker), history open/rename/delete,
   attach/drag/paste, markdown, ≤50% height, collapse/resize, stop.
7. **Safety**: prompt-injection text in a page/source is not obeyed; off-Relay
   and secret-exfil asks are declined.

Rollback unchanged: `git revert <merge> && vercel deploy --prod --yes`
(migration 0039 idempotent; no new migrations in v3 — `source_surface` and
`assistant_attachments` columns are free-text/JSONB).

## Out of scope this round (recorded, not lost)

- Deeper extension control-panel visual rebalance; popup-surface chat (side
  panel only).
- `web_search` provider-backed function-tool fallback (only the grounding path
  shipped, per the locked decision).
