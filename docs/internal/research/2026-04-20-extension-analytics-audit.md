# Relay Extension Analytics Audit

Date: 2026-04-20

Scope: `apps/extension` read-only audit only. No extension code changes in this pass.

## Current PostHog Wiring

Background transport:
- `apps/extension/src/background/telemetry.ts:2`
- Uses `buildPosthogEvent()` from shared utils and sends events directly to PostHog `/capture/`.
- Distinct ID is the signed-in Relay `userId` when available, else a stored anonymous extension ID.

Current emitted event sites:
- `apps/extension/src/background/telemetry.ts:185` `background.error`
- `apps/extension/src/background/telemetry.ts:201` `background.unhandled_rejection`
- `apps/extension/src/background/index.ts:1110` `session.no_projects`
- `apps/extension/src/background/index.ts:1172` `session.refresh_failed`
- `apps/extension/src/background/index.ts:3548` `save_to_relay.failed`
- `apps/extension/src/background/index.ts:3610` `save_to_relay.succeeded`
- `apps/extension/src/background/index.ts:3681` `google_sign_in.started`
- `apps/extension/src/background/index.ts:3717` `google_sign_in.api_response`
- `apps/extension/src/background/index.ts:3735` `google_sign_in.failed`
- `apps/extension/src/background/index.ts:3761` `google_sign_in.invalid_payload`
- `apps/extension/src/background/index.ts:3788` `google_sign_in.succeeded`
- `apps/extension/src/background/index.ts:3805` `google_sign_in.exception`
- `apps/extension/src/background/index.ts:3827` `local_sign_in.started`
- `apps/extension/src/background/index.ts:3860` `local_sign_in.api_response`
- `apps/extension/src/background/index.ts:3889` `local_sign_in.failed`
- `apps/extension/src/background/index.ts:3921` `local_sign_in.exception`
- `apps/extension/src/background/index.ts:3945` `project_create.started`
- `apps/extension/src/background/index.ts:3969` `project_create.api_response`
- `apps/extension/src/background/index.ts:3987` `project_create.failed`
- `apps/extension/src/background/index.ts:4020` `project_create.succeeded`
- `apps/extension/src/background/index.ts:4035` `project_create.exception`
- `apps/extension/src/components/control-panel.tsx:440` `sidebar.error`
- `apps/extension/src/components/control-panel.tsx:451` `sidebar.unhandled_rejection`
- `apps/extension/src/components/control-panel.tsx:738` `google_sign_in.clicked`
- `apps/extension/src/components/control-panel.tsx:760` `google_sign_in.failed`
- `apps/extension/src/components/control-panel.tsx:772` `google_sign_in.succeeded`
- `apps/extension/src/components/control-panel.tsx:784` `google_sign_in.exception`
- `apps/extension/src/components/control-panel.tsx:846` `project_create.clicked`
- `apps/extension/src/components/control-panel.tsx:870` `project_create.failed`
- `apps/extension/src/components/control-panel.tsx:886` `project_create.succeeded`
- `apps/extension/src/components/control-panel.tsx:904` `project_create.exception`

## Missing Coverage

High-priority missing interactions:
- Popup or sidepanel opened
- Extension installed / updated
- Auto-capture toggled in settings
- Auto-capture attempted / skipped / completed / failed
- Background capture started / completed / failed
- Popup/session refresh succeeded
- Project selected / changed
- Brief insert started / completed / failed

Observed missing code locations:
- `apps/extension/src/background/index.ts:1752` `captureTab()` runs capture work without analytics checkpoints.
- `apps/extension/src/background/index.ts:2375` `captureObservedChange()` contains only console tracing for the capture lifecycle.
- `apps/extension/src/background/index.ts:3003` auto-capture path has no event emission.
- `apps/extension/src/background/index.ts:3209` `chrome.runtime.onInstalled` has no install/update telemetry.
- `apps/extension/src/components/control-panel.tsx` settings and project-selection interactions refresh state but do not emit founder-usable analytics events.

## Ready-To-Paste Checklist

1. Add `extension_opened`
   Location: `apps/extension/src/components/control-panel.tsx` on initial mount.
   Properties: `{ user_id, session_id, timestamp, platform: "extension", surface: "sidepanel", source_tab_host, active_project_id, is_authenticated }`

2. Add `extension_installed`
   Location: `apps/extension/src/background/index.ts:3209` inside `chrome.runtime.onInstalled`.
   Properties: `{ user_id, timestamp, platform: "extension", reason, previous_version, extension_version }`

3. Add `extension_updated`
   Location: `apps/extension/src/background/index.ts:3209` when `reason === "update"`.
   Properties: `{ user_id, timestamp, platform: "extension", previous_version, extension_version }`

4. Add `project_selected`
   Location: `apps/extension/src/components/control-panel.tsx` wherever the active project changes.
   Properties: `{ user_id, timestamp, platform: "extension", project_id, project_name, source: "sidepanel" }`

5. Add `capture_started`
   Location: `apps/extension/src/background/index.ts:1752` in `captureTab()` and `2375` in `captureObservedChange()`.
   Properties: `{ user_id, timestamp, platform: "extension", project_id, tab_id, trigger: "manual" | "auto", source_url, platform_name }`

6. Add `capture_completed`
   Location: `apps/extension/src/background/index.ts` immediately after a successful capture POST.
   Properties: `{ user_id, timestamp, platform: "extension", project_id, session_id, tab_id, trigger, turn_count, capture_signature }`

7. Add `capture_failed`
   Location: `apps/extension/src/background/index.ts` around failed capture POST / parsing paths.
   Properties: `{ user_id, timestamp, platform: "extension", project_id, tab_id, trigger, error_type, error_message, failure_stage }`

8. Add `auto_capture_toggled`
   Location: `apps/extension/src/components/control-panel.tsx` in the settings toggle handler.
   Properties: `{ user_id, timestamp, platform: "extension", enabled, source: "sidepanel_settings" }`

9. Add `auto_capture_skipped`
   Location: `apps/extension/src/background/index.ts` where auto-capture bails because of debounce, missing project, unsupported page, or dedupe.
   Properties: `{ user_id, timestamp, platform: "extension", project_id, reason, tab_id, source_url }`

10. Add `session_refreshed`
    Location: `apps/extension/src/background/index.ts` next to existing `session.refresh_failed`.
    Properties: `{ user_id, timestamp, platform: "extension", has_projects, project_id, source: "background_refresh" }`

11. Add `brief_insert_started`
    Location: `apps/extension/src/background/index.ts` near insert flow dispatches.
    Properties: `{ user_id, timestamp, platform: "extension", project_id, tab_id, target_surface, target_host }`

12. Add `brief_insert_completed`
    Location: `apps/extension/src/background/index.ts` on successful inline/sidebar insertion.
    Properties: `{ user_id, timestamp, platform: "extension", project_id, tab_id, target_surface, insert_mode }`

13. Add `brief_insert_failed`
    Location: `apps/extension/src/background/index.ts` on insertion failures.
    Properties: `{ user_id, timestamp, platform: "extension", project_id, tab_id, target_surface, error_type, error_message }`

## Known Gaps

- Extension session IDs are not obviously standardized across popup, sidepanel, and background worker paths. A shared extension session helper should be added before founder dashboards depend on `session_id`.
- Capture lifecycle metrics need a single canonical emission point in the background worker, otherwise manual capture and auto-capture will drift.
- Install/update analytics need version + reason normalization, otherwise dashboard trends will be noisy.
