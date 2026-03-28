import { chromium } from "playwright"

const cdpUrl = process.env.POSTHOG_CDP_URL ?? "http://127.0.0.1:9222"
const environmentId = Number(process.env.POSTHOG_ENVIRONMENT_ID ?? "144745")
const currentUserId = Number(process.env.POSTHOG_USER_ID ?? "178569")
const maxAlerts = Number(process.env.POSTHOG_MAX_ALERTS ?? "2")

function trendsQuery(eventNames, options = {}) {
  const {
    breakdown,
    display = "ActionsLineGraph",
    interval = "day",
    dateFrom = "-30d",
  } = options

  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      series: eventNames.map((event) => ({
        kind: "EventsNode",
        event,
        name: event,
        math: "total",
      })),
      interval,
      dateRange: {
        date_from: dateFrom,
        explicitDate: false,
      },
      properties: [],
      trendsFilter: {
        display,
        showLegend: true,
        yAxisScaleType: "linear",
        showValuesOnSeries: false,
        smoothingIntervals: 1,
        showPercentStackView: false,
        aggregationAxisFormat: "numeric",
        showAlertThresholdLines: true,
      },
      breakdownFilter: breakdown
        ? {
            breakdown,
            breakdown_type: "event",
            breakdown_limit: 6,
          }
        : {
            breakdown_type: "event",
          },
      filterTestAccounts: false,
      version: 2,
    },
  }
}

function funnelQuery(steps, options = {}) {
  const { breakdown, dateFrom = "-30d" } = options

  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: steps.map((step) => ({
        kind: "EventsNode",
        event: step.event,
        name: step.event,
        custom_name: step.name,
      })),
      interval: "day",
      dateRange: {
        date_from: dateFrom,
        explicitDate: false,
      },
      properties: [],
      funnelsFilter: {
        layout: "horizontal",
        exclusions: [],
        funnelVizType: "steps",
        funnelOrderType: "ordered",
        funnelStepReference: "total",
        funnelWindowInterval: 14,
        breakdownAttributionType: "first_touch",
        funnelWindowIntervalUnit: "day",
      },
      breakdownFilter: breakdown
        ? {
            breakdown,
            breakdown_type: "event",
          }
        : {},
      filterTestAccounts: false,
    },
  }
}

const setup = {
  dashboards: [
    {
      name: "Relay Launch Cockpit",
      description: "Launch readiness dashboard for activation, product usage, billing, and reliability.",
      pinned: true,
      insights: [
        {
          name: "Launch traffic & signup intent",
          description: "Landing traffic, signup intent, and pricing interest over time.",
          tags: ["launch", "acquisition"],
          query: trendsQuery(["landing_page_viewed", "get_started_clicked", "auth_page_viewed", "pricing_viewed"]),
        },
        {
          name: "Auth completion signals",
          description: "Web, extension, CLI, and wizard auth completion signals over time.",
          tags: ["launch", "activation", "auth"],
          query: trendsQuery(["google_sign_in_started", "extension_authenticated", "cli_auth_completed", "wizard_auth_completed"]),
        },
        {
          name: "Project creation funnel signals",
          description: "Project creation attempts, successes, and failures.",
          tags: ["launch", "projects"],
          query: trendsQuery(["project_create_failed", "project_create_submit", "project_create_succeeded"]),
        },
        {
          name: "Core product usage",
          description: "High-signal product usage events across the main workspace.",
          tags: ["launch", "usage"],
          query: trendsQuery(["dashboard_viewed", "project_opened", "brief_viewed", "memory_viewed", "activity_viewed"]),
        },
        {
          name: "Extension inline chip activity",
          description: "Extension inline chip opens, inserts, and failures.",
          tags: ["launch", "extension"],
          query: trendsQuery(["inline_chip_shortcut_opened", "inline_chip_shortcut_insert", "inline_insert_succeeded", "inline_insert_failed"]),
        },
        {
          name: "Extension insert conversion funnel",
          description: "How often an extension chip open turns into a successful insert.",
          tags: ["launch", "extension", "funnel"],
          query: funnelQuery([
            { event: "inline_chip_shortcut_opened", name: "Chip opened" },
            { event: "inline_chip_shortcut_insert", name: "Insert triggered" },
            { event: "inline_insert_succeeded", name: "Insert succeeded" },
          ]),
        },
        {
          name: "Billing funnel signals",
          description: "Billing interest, checkout starts, checkout returns, and entitlement syncs.",
          tags: ["launch", "billing"],
          query: trendsQuery(["pricing_viewed", "billing_checkout_created", "billing_checkout_succeeded", "billing_subscription_state_synced"]),
        },
      ],
    },
    {
      name: "Relay Reliability & Errors",
      description: "Operational dashboard for errors, auth failures, extension issues, and backend reliability signals.",
      pinned: true,
      insights: [
        {
          name: "Tracked errors over time",
          description: "Top runtime and exception events over time.",
          tags: ["reliability", "errors"],
          query: trendsQuery(["$exception", "app_error_boundary_triggered", "window_error", "window_unhandled_rejection", "background_unhandled_rejection", "session_refresh_failed"]),
        },
        {
          name: "Error volume by event",
          description: "Error event totals to spot the noisiest categories quickly.",
          tags: ["reliability", "errors"],
          query: trendsQuery(["$exception", "app_error_boundary_triggered", "window_error", "window_unhandled_rejection", "background_unhandled_rejection", "session_refresh_failed"], { display: "ActionsBar" }),
        },
        {
          name: "Exceptions by surface",
          description: "Breakdown of exception events by telemetry surface.",
          tags: ["reliability", "errors"],
          query: trendsQuery(["$exception"], { breakdown: "surface", display: "ActionsBar" }),
        },
        {
          name: "Auth & session failures",
          description: "Authentication and session failures that can block activation.",
          tags: ["reliability", "auth"],
          query: trendsQuery(["google_sign_in_failed", "google_sign_in_exception", "session_refresh_failed", "project_create_failed"]),
        },
        {
          name: "Inline chip failure signals",
          description: "Extension inline chip failures and unavailable states.",
          tags: ["reliability", "extension"],
          query: trendsQuery(["inline_chip_error", "inline_insert_failed", "inline_insert_unavailable"]),
        },
        {
          name: "Backend & MCP failures",
          description: "Backend webhook/API and MCP request failures.",
          tags: ["reliability", "backend", "mcp"],
          query: trendsQuery(["billing_webhook_failed", "api_exception", "mcp_request_failed", "mcp_request_exception", "work_session_open_failed"]),
        },
      ],
    },
  ],
  alerts: [
    {
      name: "Relay exceptions daily threshold",
      insightName: "Tracked errors over time",
      upper: 5,
      calculation_interval: "daily",
    },
    {
      name: "Relay auth failures daily threshold",
      insightName: "Auth & session failures",
      upper: 3,
      calculation_interval: "daily",
    },
    {
      name: "Relay project create failures daily threshold",
      insightName: "Project creation funnel signals",
      upper: 1,
      calculation_interval: "daily",
    },
    {
      name: "Relay billing webhook failures hourly threshold",
      insightName: "Backend & MCP failures",
      upper: 0,
      calculation_interval: "hourly",
    },
  ],
  cleanup: {
    insightNames: ["Relay test insight"],
    alertNames: ["Relay tmp alert"],
  },
}

async function main() {
  const browser = await chromium.connectOverCDP(cdpUrl)
  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(`https://eu.posthog.com/project/${environmentId}/dashboard`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)

  const result = await page.evaluate(
    async ({ environmentId, currentUserId, setup, maxAlerts }) => {
      const csrfToken = document.cookie.match(/posthog_csrftoken=([^;]+)/)?.[1]

      async function api(path, options = {}) {
        const response = await fetch(path, {
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
            ...(options.headers ?? {}),
          },
          ...options,
        })

        if (response.status === 204) {
          return null
        }

        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`)
        }
        return body
      }

      const dashboardsResponse = await api(`/api/environments/${environmentId}/dashboards/?limit=2000&exclude_generated=true`)
      const insightsResponse = await api(`/api/environments/${environmentId}/insights/?limit=2000&refresh=force_cache`)
      const alertsResponse = await api(`/api/environments/${environmentId}/alerts/?limit=2000`)

      const dashboardsByName = new Map(dashboardsResponse.results.map((dashboard) => [dashboard.name, dashboard]))
      const insightsByName = new Map(insightsResponse.results.map((insight) => [insight.name, insight]))
      const alertsByName = new Map(alertsResponse.results.map((alert) => [alert.name, alert]))

      for (const alertName of setup.cleanup.alertNames) {
        const alert = alertsByName.get(alertName)
        if (alert) {
          await api(`/api/environments/${environmentId}/alerts/${alert.id}/`, { method: "DELETE" })
          alertsByName.delete(alertName)
        }
      }

      for (const insightName of setup.cleanup.insightNames) {
        const insight = insightsByName.get(insightName)
        if (insight) {
          await api(`/api/environments/${environmentId}/insights/${insight.id}/`, {
            method: "PATCH",
            body: JSON.stringify({ deleted: true }),
          })
          insightsByName.delete(insightName)
        }
      }

      const summary = { dashboards: [], insights: [], alerts: [] }

      for (const dashboardConfig of setup.dashboards) {
        let dashboard = dashboardsByName.get(dashboardConfig.name)

        if (!dashboard) {
          dashboard = await api(`/api/environments/${environmentId}/dashboards/`, {
            method: "POST",
            body: JSON.stringify({
              name: dashboardConfig.name,
              description: dashboardConfig.description,
              pinned: dashboardConfig.pinned,
            }),
          })
        } else {
          dashboard = await api(`/api/environments/${environmentId}/dashboards/${dashboard.id}/`, {
            method: "PATCH",
            body: JSON.stringify({
              name: dashboardConfig.name,
              description: dashboardConfig.description,
              pinned: dashboardConfig.pinned,
            }),
          })
        }

        dashboardsByName.set(dashboardConfig.name, dashboard)
        summary.dashboards.push({ id: dashboard.id, name: dashboard.name })

        for (const insightConfig of dashboardConfig.insights) {
          const payload = {
            name: insightConfig.name,
            description: insightConfig.description,
            dashboards: [dashboard.id],
            tags: insightConfig.tags,
            query: insightConfig.query,
          }

          const existingInsight = insightsByName.get(insightConfig.name)
          const insight = existingInsight
            ? await api(`/api/environments/${environmentId}/insights/${existingInsight.id}/`, {
                method: "PATCH",
                body: JSON.stringify(payload),
              })
            : await api(`/api/environments/${environmentId}/insights/`, {
                method: "POST",
                body: JSON.stringify(payload),
              })

          insightsByName.set(insightConfig.name, insight)
          summary.insights.push({ id: insight.id, name: insight.name, dashboard: dashboard.name })
        }
      }

      for (const alertConfig of setup.alerts.slice(0, maxAlerts)) {
        const insight = insightsByName.get(alertConfig.insightName)
        if (!insight) {
          throw new Error(`Missing insight for alert: ${alertConfig.insightName}`)
        }

        const payload = {
          insight: insight.id,
          name: alertConfig.name,
          subscribed_users: [currentUserId],
          threshold: {
            name: `${alertConfig.name} threshold`,
            configuration: {
              type: "absolute",
              bounds: {
                lower: null,
                upper: alertConfig.upper,
              },
            },
          },
          condition: {
            type: "absolute_value",
          },
          enabled: true,
          config: {
            type: "TrendsAlertConfig",
            series_index: 0,
          },
          calculation_interval: alertConfig.calculation_interval,
          skip_weekend: false,
        }

        const existingAlert = alertsByName.get(alertConfig.name)
        const alert = existingAlert
          ? await api(`/api/environments/${environmentId}/alerts/${existingAlert.id}/`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : await api(`/api/environments/${environmentId}/alerts/`, {
              method: "POST",
              body: JSON.stringify(payload),
            })

        alertsByName.set(alertConfig.name, alert)
        summary.alerts.push({ id: alert.id, name: alert.name, insight: insight.name })
      }

      return summary
    },
    { environmentId, currentUserId, setup, maxAlerts }
  )

  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
