import { createRepositoryBundle, getProjectSummaries } from "@relay/db"
import { capturePayloadSchema, withCaptureSignature } from "@relay/shared"

import { invalidateProjectCache } from "@/server/cache/invalidation"
import { decideDigestStrategy, enqueueDigestJob, scheduleDigestDrainForProject, type DigestJobOutcome } from "./digest-service"
import { getProjectStateStatus } from "./state-status-service"
import { fireUserMilestone } from "./user-milestones-service"
import {
  routePersonalFromTranscript,
  routePersonalMemory,
  type PersonalRoutingResult,
} from "./personal-memory-service"
import { classifyProjectRelevance } from "./project-relevance-service"
import { logServerEvent } from "@/server/logging/logger"

const PERSONAL_ROUTING_MAX_CHARS = 6_000

/**
 * Build the text the personal-salience classifier reads. Personal facts often
 * live in the ASSISTANT turn (e.g. "tell me everything you know about me" → the
 * assistant recites the profile), so feed the WHOLE transcript with role labels
 * and let the classifier decide what's a durable user fact. The classifier's
 * HARD REJECTS guard (assistant/world/inferred claims) keeps recited noise out;
 * confidence scoring + the soak gate are the backstop. Bounded — the classifier
 * truncates again.
 */
function buildPersonalRoutingText(
  turns: ReadonlyArray<{ role: string; content: string }>,
): string {
  return turns
    .map((turn) => {
      const content = turn.content.trim()
      if (!content) return ""
      const who = turn.role === "user" ? "User" : turn.role === "assistant" ? "Assistant" : turn.role
      return `${who}: ${content}`
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, PERSONAL_ROUTING_MAX_CHARS)
}

type CaptureRepositories = ReturnType<typeof createRepositoryBundle>

/**
 * Enqueue a deferred digest pass for each extra NON-personal project linked to a
 * session, so each extracts the facts that matter to IT from the same
 * transcript. Personal is skipped: it never receives a full project digest
 * (durable user facts are harvested separately by routePersonalMemory). Deferred
 * + per-project budget (decideDigestStrategy) keeps one capture from blowing the
 * global cap. Used by both the fresh- and duplicate-capture paths and the
 * after-the-fact link service.
 */
async function fanOutSessionProjects(
  repositories: CaptureRepositories,
  userId: string,
  input: {
    sessionId: string
    captureSignature: string | null
    extraProjectIds: string[]
    personalProjectId: string | null
  },
): Promise<void> {
  if (!input.captureSignature) return
  for (const projectId of input.extraProjectIds) {
    if (projectId === input.personalProjectId) continue
    const decision = await decideDigestStrategy(repositories, userId, {
      projectId,
      sessionId: input.sessionId,
    })
    if (decision.strategy === "skip") continue
    await enqueueDigestJob(userId, {
      projectId,
      sessionId: input.sessionId,
      captureSignature: input.captureSignature,
      status: "deferred",
    })
    scheduleDigestDrainForProject(userId, projectId, 1)
  }
}

/**
 * Automatic multi-project fan-out: classify which of the user's OTHER projects the
 * transcript is relevant to and link + fan a deferred digest into each. Best-effort
 * + fire-and-forget (never blocks the capture ack). Excludes the origin, personal,
 * and any already-linked manual targets. Personal facts are fanned separately by
 * routePersonalMemory. Gated by the caller (RELAY_MULTI_PROJECT_CAPTURE).
 */
async function autoFanOutByRelevance(
  repositories: CaptureRepositories,
  userId: string,
  input: {
    sessionId: string
    captureSignature: string
    transcript: string
    excludeProjectIds: string[]
  },
): Promise<void> {
  try {
    const exclude = new Set(input.excludeProjectIds)
    const summaries = await getProjectSummaries(repositories, userId, { includePersonal: false })
    const candidates = summaries
      .filter((project) => project.kind !== "personal" && !exclude.has(project.id))
      .map((project) => ({
        id: project.id,
        name: project.name,
        summary: project.description ?? "",
      }))
    if (candidates.length === 0) return

    const relevantIds = (
      await classifyProjectRelevance(userId, input.transcript, candidates)
    ).filter((id) => !exclude.has(id))
    if (relevantIds.length === 0) return

    await repositories.sessions.linkToProjects(input.sessionId, relevantIds, userId)
    await fanOutSessionProjects(repositories, userId, {
      sessionId: input.sessionId,
      captureSignature: input.captureSignature,
      extraProjectIds: relevantIds,
      personalProjectId: null,
    })
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "capture",
      event: "auto_fanout_failed",
      message: "Automatic multi-project fan-out failed.",
      userId,
      context: { sessionId: input.sessionId },
      error,
    }).catch(() => {})
  }
}

export async function saveCapture(userId: string, input: unknown) {
  const startedAt = Date.now()
  const repositories = createRepositoryBundle(userId)
  const parsed = capturePayloadSchema.parse(input)
  const normalizedInput = withCaptureSignature({
    ...parsed,
    session: {
      ...parsed.session,
      title: parsed.session.title ?? null
    }
  })
  const fastAck = parsed.processingMode === "fast_ack"

  // Multi-project capture: resolve the membership-verified extra targets and the
  // user's personal project id up front, so BOTH the duplicate-capture path and
  // the fresh-capture path link the session + fan out per-project extraction.
  // Personal is special: it never receives a full project digest (durable facts
  // only, harvested by routePersonalMemory), it just gets linked + surfaced.
  const multiProjectEnabled = process.env.RELAY_MULTI_PROJECT_CAPTURE === "true"
  let extraProjectIds: string[] = []
  let personalProjectId: string | null = null
  if (multiProjectEnabled && normalizedInput.additionalProjectIds?.length) {
    const requested = normalizedInput.additionalProjectIds.filter(
      (id) => id !== normalizedInput.projectId
    )
    // SECURITY: prod connects as the table owner (RLS bypassed), so authorize
    // every extra target with an explicit app-level membership check.
    extraProjectIds = await repositories.members.filterMemberProjectIds(requested, userId)
    if (extraProjectIds.length > 0) {
      personalProjectId = (await repositories.projects.getPersonalProject(userId))?.id ?? null
    }
  }

  // Is the capture's ORIGIN project the user's personal project? If so it must
  // NEVER get a full project digest (decisions/constraints/tasks/state/brief) —
  // only durable user facts via the salience classifier. This is the
  // "Personal as primary target" path (manual save / held→continue while parked
  // on Personal), distinct from Personal as an additional fan-out target.
  const originProject = await repositories.projects.getById(normalizedInput.projectId)
  const originIsPersonal = originProject?.kind === "personal"

  const latestComparable = await repositories.sessions.getLatestComparableByIdentity(
    normalizedInput.projectId,
    normalizedInput.platform,
    {
      url: normalizedInput.session.url,
      pageFingerprint: normalizedInput.session.pageFingerprint,
      sourceConversationId: normalizedInput.session.sourceConversationId
    }
  )
  const isDuplicateCapture = latestComparable?.captureSignature === normalizedInput.session.captureSignature

  if (isDuplicateCapture && latestComparable) {
    // The chat is unchanged, but the user may be adding NEW project targets to
    // an already-captured session. Route through linkSessionToProjects so the
    // dup path gets the SAME treatment as after-the-fact linking: insert the
    // session_projects rows, fan out a digest per non-personal target, AND
    // harvest personal facts when Personal is among the new targets. (Calling
    // only fanOutSessionProjects here would enqueue digests without ever
    // linking the session, and would skip the personal harvest.)
    if (extraProjectIds.length > 0) {
      await linkSessionToProjects(userId, latestComparable.id, extraProjectIds)
    }
    return {
      session: latestComparable,
      turns: [],
      digestQueued: false,
      aiJobId: null,
      duplicateSkipped: true,
      stateStatus: await getProjectStateStatus(repositories, normalizedInput.projectId)
    }
  }

  const session = await repositories.sessions.create({
    ...normalizedInput,
    session: {
      ...normalizedInput.session,
      title: normalizedInput.session.title ?? null
    }
  })
  const turns = await repositories.turns.insertDeduped(session.id, parsed.turns)
  await repositories.events.log({
    userId,
    projectId: normalizedInput.projectId,
    sessionId: session.id,
    eventType: "session_captured",
    payload: {
      platform: normalizedInput.platform,
      turnCount: turns.length
    }
  })

  // Link the session to its origin (always) plus the extra targets, so the
  // read-union surfaces it everywhere. Origin link keeps the union consistent
  // with the backfill even when no extra targets are present.
  await repositories.sessions.linkToProjects(
    session.id,
    [normalizedInput.projectId, ...extraProjectIds],
    userId,
  )
  const shouldQueueDigest = latestComparable?.captureSignature !== normalizedInput.session.captureSignature
  let jobId: string | null = null
  let digestStrategy: "skip" | "ai" | "deferred" = "skip"
  let budgetStatus: { aiUsed: number; aiLimit: number; aiRemaining: number; plan: "free" | "starter" | "pro" } | null = null
  let digestOutcome: DigestJobOutcome | null = null

  // Personal-origin captures never run a project digest — the personal harvest
  // below (routePersonalFromTranscript) is the only writer for them.
  if (shouldQueueDigest && normalizedInput.session.captureSignature && !originIsPersonal) {
    const decision = await decideDigestStrategy(repositories, userId, {
      projectId: normalizedInput.projectId,
      sessionId: session.id
    })
    digestStrategy = decision.strategy
    budgetStatus = decision.budgetStatus ?? null

    if (decision.strategy === "ai") {
      // Always run the ORIGIN digest INLINE so the user sees results without a
      // queue/cron/drain delay. (fast_ack no longer defers the origin; extra
      // fan-out projects below still run async so one save can't block N×.)
      const job = await enqueueDigestJob(userId, {
        projectId: normalizedInput.projectId,
        sessionId: session.id,
        captureSignature: normalizedInput.session.captureSignature
      })
      jobId = job.id

      const { runDigestJobInline } = await import("./digest-service")
      const inlineOutcome = await runDigestJobInline(repositories, userId, job).catch(() => null)

      if (inlineOutcome) {
        digestOutcome = inlineOutcome
      } else {
        // Inline run failed (not a budget issue) — fall back to a drain so the
        // capture still gets analyzed; this is an error path, not the norm.
        scheduleDigestDrainForProject(userId, normalizedInput.projectId, 1)
      }
    } else if (decision.strategy === "deferred") {
      // Budget is unavailable: do NOT enqueue/queue. Surface "limit hit" and
      // leave the capture un-analyzed rather than parking a deferred job.
      digestStrategy = "skip"
      await logServerEvent({
        level: "warn",
        surface: "web-api",
        area: "digest",
        event: "digest_budget_blocked",
        message: "AI digest skipped — daily budget exhausted (no job enqueued).",
        userId,
        context: {
          projectId: normalizedInput.projectId,
          sessionId: session.id,
          aiUsed: budgetStatus?.aiUsed ?? null,
          aiLimit: budgetStatus?.aiLimit ?? null,
          plan: budgetStatus?.plan ?? null,
        },
      }).catch(() => {})
    }
  }

  // Fan out a digest pass for each additional NON-personal project so each
  // extracts the facts that matter to IT from the same transcript. Personal is
  // intentionally excluded — it gets durable user facts via routePersonalMemory
  // below, never a full project digest (decisions/constraints/state/brief).
  if (shouldQueueDigest && normalizedInput.session.captureSignature && extraProjectIds.length > 0) {
    await fanOutSessionProjects(repositories, userId, {
      sessionId: session.id,
      captureSignature: normalizedInput.session.captureSignature,
      extraProjectIds,
      personalProjectId,
    })
  }

  const stateStatus = await getProjectStateStatus(repositories, normalizedInput.projectId)
  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "capture",
    event: "capture_saved",
    message: "Saved a Relay capture and queued follow-up processing.",
    userId,
    context: {
      projectId: normalizedInput.projectId,
      sessionId: session.id,
      digestStrategy,
      digestQueued: digestStrategy !== "skip",
      jobId,
      duplicateSkipped: false,
      captureSaveAckMs: Math.max(0, Date.now() - startedAt),
      bootstrapPacketsInvalidated: true,
      processingMode: fastAck ? "fast_ack" : "default",
      plan: budgetStatus?.plan ?? null,
    },
  }).catch(() => {})

  const activationRows = await repositories.provider.query<{ count: number }>(
    `select count(*)::int as count
     from capture_events
     where user_id = $1
       and event_type = 'session_captured'`,
    [userId]
  )
  const totalCaptures = Number(activationRows[0]?.count ?? 0)

  if (totalCaptures === 1) {
    void fireUserMilestone(userId, "first_session_captured", {
      project_id: normalizedInput.projectId,
      platform: normalizedInput.platform,
    }).catch(() => {})

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "capture",
      event: "activation_completed",
      message: "User completed the first successful Relay capture.",
      userId,
      projectId: normalizedInput.projectId,
      sessionId: session.id,
      context: {
        activationSource: normalizedInput.platform,
        captureCount: totalCaptures,
      },
    }).catch(() => {})
  }

  invalidateProjectCache(userId, normalizedInput.projectId)

  // Derive durable user facts from this capture into the personal project — the
  // ONLY writer of personal-type memory.
  // - origin = personal: route directly from the transcript (the project digest
  //   was skipped above). This is what fills Personal when you capture while
  //   parked on it.
  // - origin = a normal project: routePersonalMemory additionally harvests
  //   user-centric facts (self-guards when origin already IS personal).
  // Either way Personal only ever gets salience NOTES, never a project digest.
  let personalRouting: PersonalRoutingResult | null = null
  const personalSourceText = buildPersonalRoutingText(parsed.turns)
  if (personalSourceText) {
    personalRouting = originIsPersonal
      ? await routePersonalFromTranscript(userId, personalSourceText, {
          sourceSurface: normalizedInput.platform ?? "extension",
        })
      : await routePersonalMemory(
          userId,
          normalizedInput.projectId,
          personalSourceText,
          { sourceSurface: normalizedInput.platform ?? "extension" },
        )
  }

  // Automatic multi-project fan-out: fans into any OTHER project the transcript
  // is genuinely about. Fire-and-forget; deferred per-project digests + budget
  // keep it cheap. Excludes origin + manual extras (already linked above);
  // personal is excluded by kind inside autoFanOutByRelevance (includePersonal:false
  // + kind!==personal filter) so personal-origin captures safely fan to other
  // projects without double-routing back into personal.
  if (
    multiProjectEnabled &&
    personalSourceText &&
    shouldQueueDigest &&
    normalizedInput.session.captureSignature
  ) {
    void autoFanOutByRelevance(repositories, userId, {
      sessionId: session.id,
      captureSignature: normalizedInput.session.captureSignature,
      transcript: personalSourceText,
      excludeProjectIds: [normalizedInput.projectId, ...extraProjectIds],
    }).catch(() => {})
  }

  return {
    session,
    turns,
    digestQueued: digestStrategy !== "skip",
    digestStrategy,
    aiJobId: jobId,
    digestOutcome,
    budgetStatus,
    stateStatus,
    reconciliation: digestOutcome?.reconciliation ?? null,
    personalRouting,
  }
}

/**
 * Link an already-captured session to additional projects after the fact (e.g.
 * from the sidebar "also save to…" action). Reuses the existing session row —
 * never recreates it — and enqueues a deferred digest pass for each newly
 * linked project so each extracts its own facts. Membership is checked per
 * target; production runs as the table owner (RLS bypassed), so this app-level
 * check is the real enforcement.
 */
export async function linkSessionToProjects(
  userId: string,
  sessionId: string,
  projectIds: string[],
): Promise<{ linked: string[]; skipped: string[] }> {
  const repositories = createRepositoryBundle(userId)
  const session = await repositories.sessions.getById(sessionId, { includeArchived: true })
  if (!session) {
    throw new Error("Session not found.")
  }
  // The caller must be a member of the session's origin project too.
  if (!(await repositories.members.isMember(session.projectId, userId))) {
    throw new Error("Not authorized for this session.")
  }

  const requested = Array.from(new Set(projectIds.filter(Boolean))).filter(
    (id) => id !== session.projectId,
  )
  const authorized = await repositories.members.filterMemberProjectIds(requested, userId)
  const skipped = requested.filter((id) => !authorized.includes(id))

  // Only link/enqueue for projects not already linked, so this is idempotent.
  const already = new Set(await repositories.sessions.listLinkedProjectIds(sessionId))
  const newlyLinked = authorized.filter((id) => !already.has(id))
  if (newlyLinked.length === 0) {
    return { linked: [], skipped }
  }

  await repositories.sessions.linkToProjects(sessionId, newlyLinked, userId)

  const personalProjectId = (await repositories.projects.getPersonalProject(userId))?.id ?? null

  // Non-personal targets get a deferred project digest; Personal is excluded
  // (durable facts only, harvested below from the same transcript).
  await fanOutSessionProjects(repositories, userId, {
    sessionId,
    captureSignature: session.captureSignature ?? null,
    extraProjectIds: newlyLinked,
    personalProjectId,
  })

  // If Personal is a newly linked target, harvest its durable user facts from
  // the session transcript — the same path saveCapture uses, just after the
  // fact. derivedFrom = the session's origin project.
  if (personalProjectId && newlyLinked.includes(personalProjectId)) {
    const turns = await repositories.turns.listBySession(sessionId)
    const personalSourceText = buildPersonalRoutingText(
      turns.map((turn) => ({ role: turn.role, content: turn.content })),
    )
    if (personalSourceText) {
      await routePersonalMemory(userId, session.projectId, personalSourceText, {
        sourceSurface: session.platform ?? "extension",
      })
    }
  }

  for (const projectId of newlyLinked) {
    invalidateProjectCache(userId, projectId)
  }

  return { linked: newlyLinked, skipped }
}
