# F5 — Empty-Table Audit

Snapshot: dev branch `br-cool-field-aganybdc` (prod fork). Tables with 0 rows
in the `public` schema that aren't obviously feature-flagged off.

## Findings

| Table | Status | Writer | Action |
|---|---|---|---|
| `context_packets` | Wired, never called | `context-service.ts createPacket` → `repositories.contextPackets.create` (`packages/db/src/repositories/context-packet-repository.ts:24`). Caller is the per-target-profile packet builder. | **Keep.** Feature surface (export packets to target profiles) is intentional but the UX entry point isn't user-facing yet. Document, no code change. |
| `provider_counter_snapshots` | Cron-driven, never fired | `cost-snapshot-service.ts emitDailyCostSnapshots` (`apps/web/src/app/api/internal/jobs/cron/route.ts:8`). Invoked by the daily `/api/internal/jobs/cron` route. | **Keep.** Vercel Hobby tier allows one cron/day and it's already assigned to this route. The empty table on dev branch is expected — cron hasn't fired against this branch. Verify on prod after cutover by curling the cron route with `CRON_SECRET` and re-checking the count. |
| `source_external_citations` | Conditional writer | `source-repository.ts:809` writes when source-extraction tags external citations. | **Keep.** Populated lazily; only Gemini-tagged sources produce rows. Out of scope for v2. |
| `memory_relations` | Legacy v1 | Superseded by `entity_relations` (HANDOFF §6). PR #35 does not read it. | **Keep.** Drop in a later cleanup PR once `entity_relations` has soaked. |
| `referral_rewards` | No payouts yet | Reward emission cron / admin action. | **Keep.** Expected. |
| `project_settings` | User-opt-in | Only writes on per-project settings change. | **Keep.** Expected. |
| `project_state_overrides` | User-opt-in | Per-user override of project state derivation. | **Keep.** Expected. |

## Verdict

No dead tables surfaced. Every empty table has a real writer wired and an
operational reason for being empty on the dev branch (feature off, cron
not fired, opt-in path not exercised, or legacy waiting to be retired).

## Recommended follow-ups (out of PR #35 scope)

1. After prod cutover, re-run the count query against prod and confirm:
   - `provider_counter_snapshots` populated (daily cron should produce N rows).
   - `context_packets` count is intentionally still 0 (feature off) or non-zero (someone is using the export).
2. Schedule a separate small PR to drop `memory_relations` once `entity_relations` has 30 days of clean production telemetry.
