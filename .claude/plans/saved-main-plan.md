# Plan: Digest Fixes, Extension UX, CLI Update & Launch Prep

## Context

After implementing the "deferred AI digest batching" plan (commit 0b21e00), several issues remain:
1. The digest strategy threshold is too aggressive — chats with 5 turns (score 45) get deterministic even when AI budget is available (only 3 of 6 project AI used)
2. Extension UX promised by the plan was never shipped (toasts, drain trigger, budget display, upgrade nudges)
3. A workout chat got falsely auto-associated with the Relay project (routing keyword overlap too loose)
4. CLI command references are inconsistent (`@onrelay/cli` vs `@onrelay/wizard`) in 5 places
5. Only 2 Resend email templates exist (welcome + account deleted), need more for launch
6. PostHog error monitoring not set up (using PostHog instead of Sentry, 100k/mo free)
7. No Vercel auto-deploy, no Neon branching for dev

**What's already working (confirmed):**
- Deterministic digests no longer merge into project state (shouldMerge: false, merged_at: null) ✓
- AI budget service has spacing removed, daily limits only (Free: 6/project, 18/user) ✓
- Deferred strategy + batch digest processing code exists ✓
- Drain endpoint exists at `/api/projects/[id]/drain` (user-authed) ✓
- Account deletion exists as server action (`delete-account-action.ts`) with cascading deletes ✓
- Handoff feature IS implemented (Pro-only, 10-min token TTL) ✓
- RLS on all 33 tables ✓
- Rate limiting on captures (20/min), auth (5/min), billing (10/min) ✓
- Capture API returns `digestStrategy` + `budgetStatus` to extension ✓

**DB state:** Wiped and re-captured. 4 sessions remain:
- 3 got AI digests (Cross-model, CWS Approval, Context Reconciliation) — good
- 1 got deterministic (Frontend Design Workflow, 5 turns, score 45) — should have gotten AI
- Workout chat was removed manually

---

## Priority 1: Critical Fixes (ship first)

### Step 1A: Fix Digest Strategy Threshold

**File:** `apps/web/src/server/services/digest-service.ts` — `decideDigestStrategy()` (lines 220-319)

**Problem:** The decision flow currently sends score < 56 captures to deterministic even when budget IS available. A "Frontend Design Workflow" chat with 5 turns gets score 45 → deterministic, wasting available AI budget.

**Fix:** Restructure the decision flow:
```
1. Skip: 0 turns OR (no meaningful user turns AND score < 28) → "skip"
2. Skip: score < 42 AND not first state → "skip"
3. AI (priority): (firstState OR staleState OR majorUpdate) AND aiEligible → "ai"
4. AI (budget available): aiEligible AND score >= 28 → "ai"  ← NEW
5. Deferred: NOT aiEligible AND (firstState OR staleState OR majorUpdate OR score >= 42) → "deferred"  ← LOWERED from 56
6. Skip: everything else → "skip"  ← NO MORE DETERMINISTIC for state
```

**Key changes:**
- When budget IS available, use AI for anything with score >= 28 (much more generous)
- When budget is blocked, defer anything with score >= 42 (lowered from 56)
- Remove the deterministic strategy path entirely for state-affecting captures
- Keep `deterministicDigest()` function only as the "logged but not analyzed" record — never merge

**Also update** `deterministicDigest()` (line 157): Force `shouldMerge: false` always. Remove the `needsInitialOverview` logic — if it's the first state and budget is available, the strategy decision already routes to AI. If budget is blocked, it routes to deferred. Deterministic should never be the path for first state.

**Also update** `runDeterministicDigestInline()` (lines 574-674): Currently calls `persistDigestResult()` which can merge. Change to create the `session_digests` record directly with `needsProjectStateMerge: false`, skipping `persistDigestResult()` entirely. This makes deterministic truly "log only" — records the session happened but touches nothing.

**Update capture-service.ts** (line 76-83): Remove the deterministic branch from `saveCapture()`. The new flow:
- `"ai"` → enqueue + run inline (existing)
- `"deferred"` → enqueue with status "deferred" (existing)
- `"skip"` → do nothing (existing)
- `"deterministic"` → just create a minimal session_digest record, no job needed

### Step 1B: Extension Drain Trigger

**File:** `apps/extension/src/background/index.ts`

**Change:** After a capture returns `digestStrategy: "deferred"`, start a 5-minute timer. When it fires, call `POST /api/projects/{projectId}/drain` with the user's auth token.

```
On capture response with digestStrategy === "deferred":
  - Store projectId in a "pending drain" set
  - If no drain timer is running, start one (5 min)
  - When timer fires: for each projectId in set, call drain endpoint
  - Clear the set after drain completes
  - If more deferred captures came in during the drain, restart timer
```

**File:** `apps/extension/src/background/` — may need a new `drain-scheduler.ts` or add to existing service

**Endpoint already exists:** `apps/web/src/app/api/projects/[id]/drain/route.ts` — uses `withApiAuth()`, calls `drainDigestJobs(viewer.userId, 6)`

---

## Priority 2: Extension UX (promised by previous plan)

### Step 2A: Capture Result Toasts

**Files:**
- `apps/extension/src/background/association-workflow.ts` — after capture completes
- `apps/extension/src/contents/` — toast components

**Current state:** Extension shows auto_save (10s countdown), held_review, confirmed toasts. But nothing after capture completes about digest status.

**Add new toast types for capture results:**
- `digestStrategy === "ai"` → brief success toast: "Saved & analyzed" (3s, auto-dismiss)
- `digestStrategy === "deferred"` → info toast: "Saved — AI analysis queued (~5 min)" (5s)
- `digestStrategy === "deterministic"` → info toast: "Saved — basic capture only" (3s)
- `digestStrategy === "skip"` → no toast (or very subtle "Already captured")

### Step 2B: Budget Display & Upgrade Nudge

**Files:**
- Extension sidepanel UI (wherever the sidebar footer lives)
- Toast system for upgrade nudges

**Budget display in sidepanel footer:**
- Show: "⚡ {aiRemaining}/{aiLimit} AI analyses today · Free" or "· Pro"
- Pull from last capture's budgetStatus, or fetch from a new lightweight endpoint

**Upgrade nudge toast when budget exhausted:**
- When capture returns `budgetStatus.aiRemaining === 0` and `plan === "free"`:
- Show toast: "You've used all 6 AI analyses today. Upgrade to Pro for 32/day → [Upgrade]"
- Link to billing/checkout page
- Only show once per day (store in extension storage)

---

## Priority 3: Quick Wins

### Step 3A: CLI Command Standardization

Change `npx @onrelay/cli` → `npx @onrelay/wizard` in these files:
- `apps/web/src/app/docs/getting-started/page.tsx` (line 58)
- `apps/web/src/app/docs/mcp/page.tsx` (lines 22, 54)
- `apps/web/src/app/(marketing)/components/mcp-section.tsx` (lines 128, 133)

### Step 3B: Support Email Update

Change `support@onrelay.app` → `noreply@onrelay.app` in:
- `apps/web/src/server/services/email-service.ts`
- Any other email references -> `support@onrelay.app`

### Step 3C: Remove Stale "Frontend Design Workflow" Session

The session `007db876-8d20-4ec4-94e0-e20104520d9f` got a deterministic digest with no merge. It's orphaned — no state impact but takes up a session slot. Clean it from DB so user can re-capture properly.

---

## Priority 4: Security Hardening (pre-launch)

### Step 4A: Account Deletion — ALREADY EXISTS ✓

**File:** `apps/web/src/components/auth/delete-account-action.ts`
- Server action `deleteAccountAction()` already handles: delete from neon_auth + profiles (FK cascades rest)
- Sends `sendAccountDeletedEmail()` after deletion
- Verify: ensure FK cascades cover ALL tables (work_sessions, work_session_events, work_session_checkpoints, etc.)
- No new code needed unless cascading is incomplete

### Step 4B: Tighten Routing Scoring (reduce false positives)

**File:** `apps/extension/src/background/routing.ts`

**Problem:** Workout chat got associated because keyword overlap scoring is too loose.

**Fixes:**
- Raise minimum confidence threshold for auto-save (currently 70, consider 75+)
- Add negative signal: if chat title contains NO project-related keywords AND description overlap score < 10, force to "ignore"
- Consider a blacklist of obviously off-topic terms (fitness, workout, recipe, etc.) that should suppress scoring unless the project is explicitly about those topics

### Step 4C: Email Verification (future — not blocking launch)

Not critical for closed beta with friends. Add before public launch:
- Send verification email on signup
- Block capture API until email verified
- This prevents infinite free account abuse

---

## Priority 5: Launch Prep (post-fixes)

### Step 5A: Vercel Auto-Deploy Config

`vercel.json` already exists with cron config. Add ignored build step:
- In Vercel dashboard → Settings → Git → Ignored Build Step
- Custom script: `git diff --quiet HEAD^ HEAD -- apps/web/ packages/ || exit 1`
- This skips builds when only `apps/extension/`, `packages/cli/`, or non-web files change
- Connect GitHub repo → Vercel for auto-deploy on push to main
- Root directory should be `.` (monorepo root, not `apps/web`) since Next.js config handles the rest

### Step 5B: Resend Email Templates

**File:** `apps/web/src/server/services/email-service.ts`

Add templates:
- `sendBetaInviteEmail(email, inviteLink)` — for closed beta invitations
- `sendWaitlistConfirmationEmail(email)` — when someone joins waitlist
- `sendTrialExpiringEmail(email, daysLeft)` — 2 days before trial ends
- `sendDigestSummaryEmail(email, projectName, highlights)` — weekly project digest (retention)

Style: clean, minimal, on-brand. Use Relay logo, consistent colors.

### Step 5C: PostHog Error Monitoring

Set up PostHog error capture:
- Add `posthog.capture('$exception', ...)` in the API error handler (`apps/web/src/server/http/api-route.ts`)
- Add client-side error boundary reporting
- Create PostHog alerts for error rate spikes

### Step 5D: Neon Branching for Dev

Configure Neon branching workflow:
- Create dev branch from main for feature development
- Use `DATABASE_URL` pointing to branch during dev
- Merge branch when deploying
- This prevents touching prod data during development

---

## Critical Files Summary

| File | Changes |
|------|---------|
| `apps/web/src/server/services/digest-service.ts` | Fix strategy thresholds, deterministic = log-only |
| `apps/web/src/server/services/capture-service.ts` | Simplify deterministic path |
| `apps/extension/src/background/index.ts` | Add drain scheduler, capture result toasts |
| `apps/extension/src/background/drain-scheduler.ts` | NEW — drain timer management |
| `apps/extension/src/contents/` | Toast types for digest status, upgrade nudge |
| `apps/extension/src/background/routing.ts` | Tighten scoring to reduce false positives |
| `apps/web/src/app/docs/getting-started/page.tsx` | CLI: `@onrelay/cli` → `@onrelay/wizard` |
| `apps/web/src/app/docs/mcp/page.tsx` | CLI: `@onrelay/cli` → `@onrelay/wizard` (2 places) |
| `apps/web/src/app/(marketing)/components/mcp-section.tsx` | CLI: `@onrelay/cli` → `@onrelay/wizard` (2 places) |
| `apps/web/src/server/services/email-service.ts` | `noreply@` → `support@`, add templates |
| `apps/web/src/server/http/api-route.ts` | PostHog error capture |
| `apps/web/src/components/auth/delete-account-action.ts` | Verify FK cascading (existing) |

---

## Verification

1. **Digest threshold fix**: Capture a 5-turn chat → should get AI (not deterministic) when budget available
2. **Drain trigger**: Exhaust AI budget (6 captures), 7th should be deferred → after 5 min, extension calls drain → deferred jobs batch-processed
3. **Toast UX**: Each capture shows appropriate toast (success, deferred, budget warning)
4. **Budget display**: Sidepanel shows remaining AI analyses count
5. **Upgrade nudge**: After budget exhausted, toast shows upgrade CTA (free plan only)
6. **CLI command**: Visit docs pages, verify `npx @onrelay/wizard` shown everywhere
7. **Routing**: Navigate to an unrelated chat → should NOT auto-associate
8. **Account deletion**: Call DELETE /api/user/delete → verify all data cascades
9. **Brief quality**: After fresh captures with AI, call `mcp__relay__get_brief` → verify clean state

---

## Implementation Order

**Commit 1: Backend fixes (web app)**
1. Step 1A — Fix digest strategy thresholds + deterministic = log-only
2. Step 3A — CLI command standardization (5 files)
3. Step 3B — Support email update
4. Step 5C — PostHog error capture in api-route wrapper

**DB cleanup (between commits):**
5. Step 3C — Wipe stale "Frontend Design Workflow" session via Neon MCP

**Commit 2: Extension UX**
6. Step 1B — Drain scheduler (new file + integration in index.ts)
7. Step 2A — Capture result toasts (digest status feedback)
8. Step 2B — Budget display in sidepanel + upgrade nudge toast

**Commit 3: Routing + email templates**
9. Step 4B — Tighten routing scoring
10. Step 5B — Resend email templates (beta invite, waitlist, trial expiring, weekly digest)

**Manual / config (no code):**
11. Step 4A — Verify account deletion cascading
12. Step 5A — Vercel auto-deploy config (dashboard setting)
13. Step 5D — Neon branching setup (dashboard setting)

**Future (not this session):**
14. Step 4C — Email verification (before public launch, not needed for closed beta)
