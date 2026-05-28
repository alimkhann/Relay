import { createRepositoryBundle } from "@relay/db";

import { sendWelcomeEmail } from "./email-service";
import { initializeUserSettings } from "./settings-service";

export interface SyncAuthUserInput {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export async function reconcileProfileForAuthUser(input: SyncAuthUserInput) {
  const repositories = createRepositoryBundle();
  const existingProfile = await repositories.profiles.getById(input.id);
  const existingProfileRows = await repositories.provider.query<{ id: string }>(
    `select id
     from profiles
     where email = $1
     limit 1`,
    [input.email],
  );
  const legacyProfileId = existingProfileRows[0]?.id;

  if (legacyProfileId && legacyProfileId !== input.id) {
    await repositories.provider.query(
      `with ensure_target_profile as (
         insert into profiles (id, email, display_name, avatar_url)
         values ($2, null, $3, $4)
         on conflict (id) do nothing
       ),
       moved_projects as (
         update projects
         set owner_id = $2
         where owner_id = $1
       ),
       merged_project_members as (
         insert into project_members (project_id, user_id, role)
         select project_id, $2, role
         from project_members
         where user_id = $1
         on conflict (project_id, user_id) do update
         set role = excluded.role
       ),
       deleted_project_members as (
         delete from project_members
         where user_id = $1
       ),
       moved_memory as (
         update memory_items
         set created_by = $2
         where created_by = $1
       ),
       moved_context_packets as (
         update context_packets
         set created_by = $2
         where created_by = $1
       ),
       moved_capture_events as (
         update capture_events
         set user_id = $2
         where user_id = $1
       ),
       merged_settings as (
         insert into user_settings (user_id, settings)
         select $2, settings
         from user_settings
         where user_id = $1
         on conflict (user_id) do update
         set settings = excluded.settings,
             updated_at = now()
       ),
       deleted_settings as (
         delete from user_settings
         where user_id = $1
       ),
       merged_onboarding as (
         insert into user_onboarding (
           user_id,
           status,
           completed_project_id,
           completed_via,
           completed_at
         )
         select
           $2,
           status,
           completed_project_id,
           completed_via,
           completed_at
         from user_onboarding
         where user_id = $1
         on conflict (user_id) do update
         set status = excluded.status,
             completed_project_id = excluded.completed_project_id,
             completed_via = excluded.completed_via,
             completed_at = excluded.completed_at,
             updated_at = now()
       ),
       deleted_onboarding as (
         delete from user_onboarding
         where user_id = $1
       ),
       moved_tokens as (
         update extension_api_tokens
         set user_id = $2
         where user_id = $1
       ),
       moved_browser_handoffs as (
         update browser_session_handoffs
         set user_id = $2
         where user_id = $1
       ),
       moved_session_digests as (
         update session_digests
         set created_by = $2
         where created_by = $1
       ),
       moved_bootstrap_packets as (
         update bootstrap_packets
         set created_by = $2
         where created_by = $1
       ),
       moved_ai_job_runs as (
         update ai_job_runs
         set created_by = $2
         where created_by = $1
       ),
       moved_connect_grants as (
         update extension_connect_grants
         set user_id = $2
         where user_id = $1
       ),
       deleted_legacy_billing_customers as (
         delete from billing_customers
         where user_id = $1
            or external_customer_id = $1
         returning *
       ),
       merged_billing_customers as (
         insert into billing_customers (
           user_id,
           provider,
           provider_customer_id,
           external_customer_id,
           email,
           name,
           trial_claimed_at
         )
         select
           $2,
           provider,
           provider_customer_id,
           $2,
           email,
           name,
           trial_claimed_at
         from deleted_legacy_billing_customers
         on conflict (user_id) do update
         set provider_customer_id = coalesce(excluded.provider_customer_id, billing_customers.provider_customer_id),
             external_customer_id = excluded.external_customer_id,
             email = coalesce(excluded.email, billing_customers.email),
             name = coalesce(excluded.name, billing_customers.name),
             trial_claimed_at = coalesce(excluded.trial_claimed_at, billing_customers.trial_claimed_at),
             updated_at = now()
       ),
       moved_subscriptions as (
         update subscriptions
         set user_id = $2,
             updated_at = now()
         where user_id = $1
       ),
       merged_entitlements as (
         insert into entitlements (
           user_id,
           plan_key,
           status,
           provider_customer_id,
           provider_subscription_id,
           interval,
           active_projects_limit,
           history_retention_days,
           capture_limit_monthly,
           mcp_read_limit_daily,
           mcp_write_limit_daily,
           handoff_enabled,
           trial_ends_at,
           current_period_end
         )
         select
           $2,
           plan_key,
           status,
           provider_customer_id,
           provider_subscription_id,
           interval,
           active_projects_limit,
           history_retention_days,
           capture_limit_monthly,
           mcp_read_limit_daily,
           mcp_write_limit_daily,
           handoff_enabled,
           trial_ends_at,
           current_period_end
         from entitlements
         where user_id = $1
         on conflict (user_id) do update
         set plan_key = excluded.plan_key,
             status = excluded.status,
             provider_customer_id = excluded.provider_customer_id,
             provider_subscription_id = excluded.provider_subscription_id,
             interval = excluded.interval,
             active_projects_limit = excluded.active_projects_limit,
             history_retention_days = excluded.history_retention_days,
             capture_limit_monthly = excluded.capture_limit_monthly,
             mcp_read_limit_daily = excluded.mcp_read_limit_daily,
             mcp_write_limit_daily = excluded.mcp_write_limit_daily,
             handoff_enabled = excluded.handoff_enabled,
             trial_ends_at = excluded.trial_ends_at,
             current_period_end = excluded.current_period_end,
             updated_at = now()
       ),
       deleted_legacy_entitlements as (
         delete from entitlements
         where user_id = $1
       ),
       deleted_legacy_profile as (
         delete from profiles
         where id = $1
       )
       update profiles
       set email = $5,
           display_name = $3,
           avatar_url = $4,
           updated_at = now()
       where id = $2`,
      [
        legacyProfileId,
        input.id,
        input.name ?? null,
        input.image ?? null,
        input.email,
      ],
    );

    await initializeUserSettings(input.id);
    await repositories.projects.ensurePersonalProject(input.id);
    return;
  }

  await repositories.profiles.upsert({
    id: input.id,
    email: input.email,
    displayName: input.name ?? null,
    avatarUrl: input.image ?? null,
  });

  if (!existingProfile) {
    void sendWelcomeEmail(input.email, input.name ?? null);
  }

  await initializeUserSettings(input.id, {
    newUser: !existingProfile,
  });

  // Every user gets exactly one personal project (kind='personal') that backs
  // their personal memory. Idempotent — safe to call on every bootstrap.
  await repositories.projects.ensurePersonalProject(input.id);
}
