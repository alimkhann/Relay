# Relay PostHog Audit

Date: 2026-04-21T18:28:58.074Z

Project: 144745

## Scope Notes

- Key supports dashboard, insight, and feature flag reads for this project.
- Query, cohorts, person, replay, and event/property definition scopes are restricted, so this rebuild stays event/property-driven.

## Existing Dashboards

### 🚀 Activation Funnel

No manual critique template found for this dashboard.

### 💸 Costs & AI Usage

No manual critique template found for this dashboard.

### 🐛 Errors & Health

No manual critique template found for this dashboard.

### 🏠 Overview — What's Happening Right Now

No manual critique template found for this dashboard.

### 🔁 Retention & Engagement

No manual critique template found for this dashboard.

## Replacement Plan

- Delete overlapping legacy dashboards.
- Recreate exactly 5 founder dashboards anchored on canonical snake_case events.
- Keep dashboards event/property-driven so they remain editable without query:read.
