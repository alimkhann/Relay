#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY ?? process.env.POSTHOG_API_KEY ?? null
const PROJECT_ID = Number(process.env.POSTHOG_PROJECT_ID ?? "144745")
const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://eu.posthog.com"
const DRY_RUN = process.argv.includes("--dry-run")
const AUDIT_REPORT_PATH = path.resolve(
  process.cwd(),
  "docs/internal/research/2026-04-20-posthog-audit.md"
)

if (!API_KEY) {
  console.error("Set POSTHOG_PERSONAL_API_KEY or POSTHOG_API_KEY before running this script.")
  process.exit(1)
}

function eventNode(event, options = {}) {
  return {
    kind: "EventsNode",
    event,
    name: event,
    custom_name: options.customName,
    math: options.math ?? "total",
    ...(options.mathProperty ? { math_property: options.mathProperty } : {}),
  }
}

function eventProperty(key, value) {
  return {
    key,
    value,
    operator: "exact",
    type: "event",
  }
}

function trendsQuery(series, options = {}) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      series,
      interval: options.interval ?? "day",
      dateRange: {
        date_from: options.dateFrom ?? "-30d",
        explicitDate: false,
      },
      properties: options.properties ?? [],
      trendsFilter: {
        display: options.display ?? "ActionsLineGraph",
        showLegend: options.showLegend ?? true,
        yAxisScaleType: "linear",
        showValuesOnSeries: options.showValuesOnSeries ?? false,
        smoothingIntervals: 1,
        showPercentStackView: false,
        aggregationAxisFormat: "numeric",
        showAlertThresholdLines: false,
      },
      breakdownFilter: options.breakdown
        ? {
            breakdown: options.breakdown,
            breakdown_type: "event",
            breakdown_limit: options.breakdownLimit ?? 10,
          }
        : {
            breakdown_type: "event",
          },
      filterTestAccounts: true,
      version: 2,
    },
  }
}

function funnelQuery(steps, options = {}) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: steps.map((step) => ({
        kind: "EventsNode",
        event: step.event,
        name: step.event,
        custom_name: step.name,
        ...(step.properties ? { properties: step.properties } : {}),
      })),
      interval: "day",
      dateRange: {
        date_from: options.dateFrom ?? "-30d",
        explicitDate: false,
      },
      properties: options.properties ?? [],
      funnelsFilter: {
        layout: "horizontal",
        exclusions: [],
        funnelVizType: options.funnelVizType ?? "steps",
        funnelOrderType: "ordered",
        funnelStepReference: "total",
        funnelWindowInterval: options.windowDays ?? 14,
        breakdownAttributionType: "first_touch",
        funnelWindowIntervalUnit: "day",
      },
      breakdownFilter: options.breakdown
        ? {
            breakdown: options.breakdown,
            breakdown_type: "event",
          }
        : {},
      filterTestAccounts: true,
      version: 2,
    },
  }
}

function retentionQuery(targetEvent, options = {}) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "RetentionQuery",
      dateRange: {
        date_from: options.dateFrom ?? "-90d",
        explicitDate: false,
      },
      properties: options.properties ?? [],
      retentionFilter: {
        period: options.period ?? "Week",
        targetEntity: {
          id: targetEvent,
          name: targetEvent,
          type: "events",
        },
        retentionType: "retention_first_time",
        totalIntervals: options.totalIntervals ?? 8,
        returningEntity: {
          id: options.returningEvent ?? targetEvent,
          name: options.returningEvent ?? targetEvent,
          type: "events",
        },
      },
      filterTestAccounts: true,
      version: 2,
    },
  }
}

const dashboardDefinitions = [
  {
    name: "🏠 Overview — What's Happening Right Now",
    description:
      "Founder overview for daily activity, sign-ins, usage volume, and breakage. Uses explicit business events instead of $pageview proxies.",
    insights: [
      {
        name: "Overview · Active users (30d)",
        description: "Daily active users trend over the last 30 days.",
        query: trendsQuery([eventNode("page_viewed", { customName: "Active users", math: "dau" })]),
      },
      {
        name: "Overview · Top events today",
        description: "Top founder-relevant events by volume today.",
        query: trendsQuery(
          [
            eventNode("page_viewed", { customName: "Page views" }),
            eventNode("sign_in_completed", { customName: "Sign-ins" }),
            eventNode("project_created", { customName: "Projects created" }),
            eventNode("capture_saved", { customName: "Captures saved" }),
            eventNode("activation_completed", { customName: "Activated users" }),
            eventNode("error_occurred", { customName: "Errors" }),
          ],
          { dateFrom: "-1d", display: "ActionsBar", showLegend: true }
        ),
      },
      {
        name: "Overview · New sign-ins today",
        description: "Sign-in completions today, broken down by auth intent.",
        query: trendsQuery(
          [eventNode("sign_in_completed", { customName: "Sign-ins" })],
          { dateFrom: "-1d", display: "ActionsBarValue", breakdown: "auth_intent" }
        ),
      },
      {
        name: "Overview · Active sessions proxy today",
        description: "Workspace activity proxy based on distinct active users today.",
        query: trendsQuery(
          [eventNode("page_viewed", { customName: "Active sessions proxy", math: "dau" })],
          {
            dateFrom: "-1d",
            display: "ActionsBarValue",
            properties: [eventProperty("page_group", ["workspace"])],
          }
        ),
      },
      {
        name: "Overview · Errors today",
        description: "Total error volume today.",
        query: trendsQuery(
          [eventNode("error_occurred", { customName: "Errors" })],
          { dateFrom: "-1d", display: "ActionsBarValue" }
        ),
      },
      {
        name: "Overview · Error trend (7d)",
        description: "Error volume trend over the last 7 days.",
        query: trendsQuery([eventNode("error_occurred", { customName: "Errors" })], {
          dateFrom: "-7d",
        }),
      },
      {
        name: "Overview · Activity by platform",
        description: "Cross-surface activity broken down by platform.",
        query: trendsQuery([eventNode("page_viewed", { customName: "Activity", math: "dau" })], {
          dateFrom: "-30d",
          breakdown: "platform",
        }),
      },
    ],
  },
  {
    name: "🚀 Activation Funnel",
    description:
      "Maps the product journey from first visit to first successful capture, with drop-off and activation timing views.",
    insights: [
      {
        name: "Activation · Funnel",
        description: "Ordered funnel from visit to activation.",
        query: funnelQuery([
          { event: "page_viewed", name: "First visit" },
          { event: "sign_in_completed", name: "Signed in" },
          { event: "project_created", name: "Project created" },
          { event: "capture_saved", name: "First capture saved" },
          { event: "activation_completed", name: "Activated" },
        ]),
      },
      {
        name: "Activation · Funnel by platform",
        description: "Ordered activation funnel broken down by platform.",
        query: funnelQuery(
          [
            { event: "page_viewed", name: "First visit" },
            { event: "sign_in_completed", name: "Signed in" },
            { event: "project_created", name: "Project created" },
            { event: "capture_saved", name: "First capture saved" },
            { event: "activation_completed", name: "Activated" },
          ],
          { breakdown: "platform" }
        ),
      },
      {
        name: "Activation · Time to activate",
        description: "Time-to-convert view for the activation funnel.",
        query: funnelQuery(
          [
            { event: "page_viewed", name: "First visit" },
            { event: "sign_in_completed", name: "Signed in" },
            { event: "project_created", name: "Project created" },
            { event: "capture_saved", name: "First capture saved" },
            { event: "activation_completed", name: "Activated" },
          ],
          { funnelVizType: "time_to_convert" }
        ),
      },
      {
        name: "Activation · Completions by day",
        description: "Activation completions by day.",
        query: trendsQuery([eventNode("activation_completed", { customName: "Activated users" })]),
      },
    ],
  },
  {
    name: "🔁 Retention & Engagement",
    description:
      "Anchors retention on activation, not pageview templates, and tracks ongoing engagement with product events.",
    insights: [
      {
        name: "Retention · Weekly cohort",
        description: "Weekly retention cohort anchored on activation_completed.",
        query: retentionQuery("activation_completed", {
          period: "Week",
          dateFrom: "-90d",
          totalIntervals: 8,
        }),
      },
      {
        name: "Retention · DAU",
        description: "Daily active users.",
        query: trendsQuery([eventNode("page_viewed", { customName: "DAU", math: "dau" })], {
          dateFrom: "-30d",
          interval: "day",
        }),
      },
      {
        name: "Retention · WAU",
        description: "Weekly active users.",
        query: trendsQuery([eventNode("page_viewed", { customName: "WAU", math: "dau" })], {
          dateFrom: "-90d",
          interval: "week",
        }),
      },
      {
        name: "Retention · MAU",
        description: "Monthly active users.",
        query: trendsQuery([eventNode("page_viewed", { customName: "MAU", math: "dau" })], {
          dateFrom: "-180d",
          interval: "month",
        }),
      },
      {
        name: "Retention · Feature adoption",
        description: "Feature usage by event volume over the last 30 days.",
        query: trendsQuery(
          [
            eventNode("project_opened", { customName: "Project opened" }),
            eventNode("capture_saved", { customName: "Capture saved" }),
            eventNode("digest_completed", { customName: "Digest completed" }),
            eventNode("capture_completed", { customName: "Extension capture" }),
            eventNode("brief_insert_completed", { customName: "Brief inserted" }),
            eventNode("mcp_tool_completed", { customName: "MCP tool completed" }),
            eventNode("cli_install_completed", { customName: "CLI install completed" }),
            eventNode("wizard_completed", { customName: "Wizard completed" }),
          ],
          { dateFrom: "-30d", display: "ActionsBar" }
        ),
      },
      {
        name: "Retention · Stickiness proxy",
        description: "DAU and MAU components shown together as a stickiness proxy.",
        query: trendsQuery(
          [
            eventNode("page_viewed", { customName: "DAU", math: "dau" }),
            eventNode("activation_completed", { customName: "Activated users", math: "dau" }),
          ],
          { dateFrom: "-30d", interval: "day" }
        ),
      },
    ],
  },
  {
    name: "💸 Costs & AI Usage",
    description:
      "Tracks Gemini request volume, token usage, estimated AI spend, infra spend, and founder unit economics including cost per user and billing sanity signals.",
    insights: [
      {
        name: "Costs · Total spend by day",
        description: "Daily total spend from unit economics rollups.",
        query: trendsQuery(
          [eventNode("unit_economics_snapshot", { customName: "Total spend", math: "sum", mathProperty: "total_usd" })],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · AI spend by day",
        description: "Estimated AI spend by day from ai_request_completed events.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "AI spend", math: "sum", mathProperty: "estimated_cost_usd" })],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · Infra spend by provider",
        description: "Daily infra spend by provider from cost_snapshot events.",
        query: trendsQuery(
          [eventNode("cost_snapshot", { customName: "Infra spend", math: "sum", mathProperty: "cost_usd" })],
          { dateFrom: "-30d", breakdown: "provider", properties: [eventProperty("provider", ["vercel", "neon", "total"])] }
        ),
      },
      {
        name: "Costs · Cost per active user",
        description: "Daily total spend divided by daily active users.",
        query: trendsQuery(
          [eventNode("unit_economics_snapshot", { customName: "Cost / active user", math: "avg", mathProperty: "cost_per_active_user_usd" })],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · Cost per paying user",
        description: "Daily total spend divided by paying active users.",
        query: trendsQuery(
          [eventNode("unit_economics_snapshot", { customName: "Cost / paying user", math: "avg", mathProperty: "cost_per_paying_user_usd" })],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · Cost per activation",
        description: "Daily total spend divided by new activations.",
        query: trendsQuery(
          [eventNode("unit_economics_snapshot", { customName: "Cost / new activation", math: "avg", mathProperty: "cost_per_new_activation_usd" })],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · Cost per AI request",
        description: "Daily total spend divided by AI request count.",
        query: trendsQuery(
          [eventNode("unit_economics_snapshot", { customName: "Cost / AI request", math: "avg", mathProperty: "cost_per_ai_request_usd" })],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · AI request volume by success",
        description: "AI request counts broken down by success.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "AI requests" })],
          { dateFrom: "-30d", breakdown: "success", display: "ActionsBar" }
        ),
      },
      {
        name: "Costs · Token usage by model",
        description: "Token totals broken down by actual model.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "Tokens", math: "sum", mathProperty: "tokens_total" })],
          { dateFrom: "-30d", breakdown: "actual_model" }
        ),
      },
      {
        name: "Costs · Average latency by operation",
        description: "Average AI latency broken down by operation.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "Average latency", math: "avg", mathProperty: "latency_ms" })],
          { dateFrom: "-30d", breakdown: "operation", display: "ActionsBar" }
        ),
      },
      {
        name: "Costs · Most expensive operations",
        description: "Estimated AI spend broken down by operation.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "Spend", math: "sum", mathProperty: "estimated_cost_usd" })],
          { dateFrom: "-30d", breakdown: "operation", display: "ActionsBar" }
        ),
      },
      {
        name: "Costs · Spend by source surface",
        description: "Estimated AI spend broken down by source surface.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "Spend", math: "sum", mathProperty: "estimated_cost_usd" })],
          { dateFrom: "-30d", breakdown: "surface", display: "ActionsBar" }
        ),
      },
      {
        name: "Costs · Most expensive projects",
        description: "Estimated AI spend broken down by project.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "Spend", math: "sum", mathProperty: "estimated_cost_usd" })],
          { dateFrom: "-30d", breakdown: "project_id", breakdownLimit: 20, display: "ActionsBar" }
        ),
      },
      {
        name: "Costs · Top cost-driving users",
        description: "Estimated AI spend broken down by user.",
        query: trendsQuery(
          [eventNode("ai_request_completed", { customName: "Spend", math: "sum", mathProperty: "estimated_cost_usd" })],
          { dateFrom: "-30d", breakdown: "user_id", breakdownLimit: 20, display: "ActionsBar" }
        ),
      },
      {
        name: "Costs · Free vs paid active users",
        description: "Daily free and paying active user counts.",
        query: trendsQuery(
          [
            eventNode("unit_economics_snapshot", { customName: "Free active users", math: "avg", mathProperty: "free_active_users" }),
            eventNode("unit_economics_snapshot", { customName: "Paying active users", math: "avg", mathProperty: "paying_active_users" }),
          ],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · Free user cost share",
        description: "Estimated free-user share of daily spend.",
        query: trendsQuery(
          [eventNode("unit_economics_snapshot", { customName: "Free user cost share %", math: "avg", mathProperty: "free_user_cost_share_pct" })],
          { dateFrom: "-30d" }
        ),
      },
      {
        name: "Costs · Usage limits shown",
        description: "Volume of usage limit warnings/blocks.",
        query: trendsQuery([eventNode("usage_limit_shown", { customName: "Usage limits shown" })], {
          dateFrom: "-30d",
          breakdown: "limit_name",
          display: "ActionsBar",
        }),
      },
      {
        name: "Costs · Checkout and plan transitions",
        description: "Billing conversion and plan state changes.",
        query: trendsQuery(
          [
            eventNode("billing_checkout_completed", { customName: "Checkout completed" }),
            eventNode("subscription_state_changed", { customName: "Plan transitions" }),
          ],
          { dateFrom: "-30d", display: "ActionsBar" }
        ),
      },
    ],
  },
  {
    name: "📈 Limits, Agents & Conversion",
    description:
      "Tracks action quota pressure, limit-driven upgrades, Ask Relay cost/tool behavior, and MCP activation. Production events only.",
    insights: [
      {
        name: "Limits · Free activation to paid conversion",
        description: "Free-user journey from activation through a limit block to paid checkout.",
        query: funnelQuery(
          [
            { event: "activation_completed", name: "Activated" },
            { event: "quota_blocked", name: "Hit a limit" },
            { event: "limit_upgrade_clicked", name: "Clicked upgrade" },
            { event: "billing_checkout_completed", name: "Converted" },
          ],
          { properties: [eventProperty("plan", ["free"]), eventProperty("environment", ["production"])] }
        ),
      },
      {
        name: "Limits · Hit to checkout funnel",
        description: "Conversion funnel after a quota block, broken down by upgrade target.",
        query: funnelQuery(
          [
            { event: "quota_blocked", name: "Limit hit" },
            { event: "limit_upgrade_clicked", name: "Upgrade clicked" },
            { event: "billing_checkout_completed", name: "Checkout completed" },
          ],
          { breakdown: "next_plan", properties: [eventProperty("environment", ["production"])] }
        ),
      },
      {
        name: "Limits · Reads and writes consumed by plan",
        description: "Action consumption volume by quota family and plan.",
        query: trendsQuery(
          [eventNode("quota_consumed", { customName: "Actions consumed", math: "sum", mathProperty: "amount" })],
          { breakdown: "plan", properties: [eventProperty("environment", ["production"])] }
        ),
      },
      {
        name: "Agents · Ask Relay tokens by intent",
        description: "Ask Relay token usage broken down by routed intent.",
        query: trendsQuery(
          [eventNode("assistant_turn_completed", { customName: "Ask Relay tokens", math: "sum", mathProperty: "totalTokens" })],
          { breakdown: "intentRoute", properties: [eventProperty("environment", ["production"])] }
        ),
      },
      {
        name: "Agents · Tool-call frequency",
        description: "Ask Relay tool-call frequency by tool.",
        query: trendsQuery(
          [eventNode("assistant_tool_used", { customName: "Tool calls" })],
          { breakdown: "tool", display: "ActionsBar", properties: [eventProperty("environment", ["production"])] }
        ),
      },
      {
        name: "MCP · Connection to first read and write",
        description: "MCP activation funnel from first connection to first read and write.",
        query: funnelQuery(
          [
            { event: "mcp_connected_first_time", name: "Connected" },
            { event: "mcp_tool_completed", name: "First read", properties: [eventProperty("read_or_write", ["read"])] },
            { event: "mcp_tool_completed", name: "First write", properties: [eventProperty("read_or_write", ["write"])] },
          ],
          { properties: [eventProperty("environment", ["production"])] }
        ),
      },
    ],
  },
  {
    name: "🐛 Errors & Health",
    description:
      "Operational error dashboard grounded in error_occurred and AI request telemetry, plus activation funnel health checks.",
    insights: [
      {
        name: "Health · Error trend",
        description: "Error events over the last 7 days.",
        query: trendsQuery([eventNode("error_occurred", { customName: "Errors" })], {
          dateFrom: "-7d",
        }),
      },
      {
        name: "Health · Errors by type",
        description: "Top error types over the last 7 days.",
        query: trendsQuery([eventNode("error_occurred", { customName: "Errors" })], {
          dateFrom: "-7d",
          breakdown: "error_type",
          display: "ActionsBar",
        }),
      },
      {
        name: "Health · Top error messages",
        description: "Top error messages over the last 7 days.",
        query: trendsQuery([eventNode("error_occurred", { customName: "Errors" })], {
          dateFrom: "-7d",
          breakdown: "error_message",
          breakdownLimit: 15,
          display: "ActionsBar",
        }),
      },
      {
        name: "Health · AI outcomes",
        description: "AI request outcomes broken down by success flag.",
        query: trendsQuery([eventNode("ai_request_completed", { customName: "AI requests" })], {
          dateFrom: "-7d",
          breakdown: "success",
          display: "ActionsBar",
        }),
      },
      {
        name: "Health · Errors by surface",
        description: "Error volume broken down by surface.",
        query: trendsQuery([eventNode("error_occurred", { customName: "Errors" })], {
          dateFrom: "-7d",
          breakdown: "surface",
          display: "ActionsBar",
        }),
      },
      {
        name: "Health · Errors by platform",
        description: "Error volume broken down by platform.",
        query: trendsQuery([eventNode("error_occurred", { customName: "Errors" })], {
          dateFrom: "-7d",
          breakdown: "platform",
          display: "ActionsBar",
        }),
      },
      {
        name: "Health · Broken activation funnel",
        description: "Activation funnel health, broken down by platform.",
        query: funnelQuery(
          [
            { event: "page_viewed", name: "First visit" },
            { event: "sign_in_completed", name: "Signed in" },
            { event: "project_created", name: "Project created" },
            { event: "capture_saved", name: "First capture saved" },
            { event: "activation_completed", name: "Activated" },
          ],
          { breakdown: "platform" }
        ),
      },
    ],
  },
]

const legacyDashboardsToReplace = new Set([
  "Landing page & acquisition",
  "Relay Launch Cockpit",
  "Relay Reliability & Errors",
  "My App Dashboard",
  "Relay API write probe",
  ...dashboardDefinitions.map((dashboard) => dashboard.name),
])

const finalInsightNames = new Set(
  dashboardDefinitions.flatMap((dashboard) => dashboard.insights.map((insight) => insight.name))
)

const dashboardCritiques = {
  "Landing page & acquisition":
    "What it tells you: top-of-funnel landing traffic and acquisition slices.\nWhat it misses: any connection to sign-in, project creation, capture, or activation.\nFounder actionability: low, because it optimizes anonymous traffic without showing whether visitors become real users.",
  "Relay Launch Cockpit":
    "What it tells you: a broad launch snapshot across auth, product usage, extension, and billing.\nWhat it misses: a canonical activation event, retention anchor, and reliable AI/cost attribution.\nFounder actionability: medium-low, because several widgets depend on surrogate events like dashboard_viewed and web_auth_route_response.",
  "Relay Reliability & Errors":
    "What it tells you: raw exception and failure volume across app surfaces.\nWhat it misses: error rates relative to sessions/users, the most broken steps in the funnel, and cost/AI failure correlation.\nFounder actionability: medium, because it surfaces pain but not severity against denominator metrics.",
  "My App Dashboard":
    "What it tells you: generic template metrics such as WAU/retention.\nWhat it misses: Relay-specific activation, capture, project, and AI usage definitions.\nFounder actionability: low, because the widgets are template defaults rather than product decisions.",
}

async function apiFetch(resourcePath, options = {}) {
  const response = await fetch(`${POSTHOG_HOST}/api/projects/${PROJECT_ID}${resourcePath}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return null
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${resourcePath} failed: ${response.status} ${JSON.stringify(payload)}`)
  }

  return payload
}

async function listAll(resourcePath) {
  const results = []
  let offset = 0
  const limit = 100

  while (true) {
    const payload = await apiFetch(`${resourcePath}${resourcePath.includes("?") ? "&" : "?"}limit=${limit}&offset=${offset}`)
    const rows = payload?.results ?? []
    results.push(...rows)
    if (rows.length < limit) {
      return results
    }
    offset += limit
  }
}

function buildAuditMarkdown(dashboards) {
  const lines = [
    "# Relay PostHog Audit",
    "",
    `Date: ${new Date().toISOString()}`,
    "",
    `Project: ${PROJECT_ID}`,
    "",
    "## Scope Notes",
    "",
    "- Key supports dashboard, insight, and feature flag reads for this project.",
    "- Query, cohorts, person, replay, and event/property definition scopes are restricted, so this rebuild stays event/property-driven.",
    "",
    "## Existing Dashboards",
    "",
  ]

  for (const dashboard of dashboards) {
    lines.push(`### ${dashboard.name}`)
    lines.push("")
    lines.push(dashboardCritiques[dashboard.name] ?? "No manual critique template found for this dashboard.")
    lines.push("")
  }

  lines.push("## Replacement Plan")
  lines.push("")
  lines.push("- Delete overlapping legacy dashboards.")
  lines.push("- Recreate founder dashboards anchored on canonical snake_case events.")
  lines.push("- Keep dashboards event/property-driven so they remain editable without query:read.")
  lines.push("")

  return lines.join("\n")
}

async function ensureAuditReport(dashboards) {
  await fs.mkdir(path.dirname(AUDIT_REPORT_PATH), { recursive: true })
  await fs.writeFile(AUDIT_REPORT_PATH, buildAuditMarkdown(dashboards), "utf8")
}

async function markDeleted(resourcePath) {
  await apiFetch(resourcePath, {
    method: "PATCH",
    body: {
      deleted: true,
    },
  })
}

async function main() {
  const [dashboards, insights, featureFlags] = await Promise.all([
    listAll("/dashboards/"),
    listAll("/insights/"),
    listAll("/feature_flags/"),
  ])

  await ensureAuditReport(dashboards)

  const dashboardsToDelete = dashboards.filter((dashboard) => legacyDashboardsToReplace.has(dashboard.name))
  const insightsToDelete = insights.filter((insight) => !finalInsightNames.has(insight.name))

  const summary = {
    dryRun: DRY_RUN,
    projectId: PROJECT_ID,
    existingDashboards: dashboards.map((dashboard) => ({ id: dashboard.id, name: dashboard.name })),
    existingFeatureFlags: featureFlags.length,
    deleteDashboards: dashboardsToDelete.map((dashboard) => ({ id: dashboard.id, name: dashboard.name })),
    deleteInsights: insightsToDelete.map((insight) => ({ id: insight.id, name: insight.name })),
    createDashboards: dashboardDefinitions.map((dashboard) => ({
      name: dashboard.name,
      insights: dashboard.insights.map((insight) => insight.name),
    })),
    auditReportPath: AUDIT_REPORT_PATH,
  }

  if (DRY_RUN) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  for (const insight of insightsToDelete) {
    await markDeleted(`/insights/${insight.id}/`)
  }

  for (const dashboard of dashboardsToDelete) {
    await markDeleted(`/dashboards/${dashboard.id}/`)
  }

  const createdDashboards = []

  for (const dashboardDefinition of dashboardDefinitions) {
    const dashboard = await apiFetch("/dashboards/", {
      method: "POST",
      body: {
        name: dashboardDefinition.name,
        description: dashboardDefinition.description,
        pinned: true,
      },
    })

    createdDashboards.push({ id: dashboard.id, name: dashboard.name, insights: [] })

    for (const insightDefinition of dashboardDefinition.insights) {
      const insight = await apiFetch("/insights/", {
        method: "POST",
        body: {
          name: insightDefinition.name,
          description: insightDefinition.description,
          query: insightDefinition.query,
          dashboards: [dashboard.id],
          tags: ["relay", "founder", "rebuild-2026-04-20"],
        },
      })

      createdDashboards.at(-1)?.insights.push({ id: insight.id, name: insight.name })
    }
  }

  console.log(
    JSON.stringify(
      {
        ...summary,
        createdDashboards,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
