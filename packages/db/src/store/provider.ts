import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getDemoStore, type RelayStore } from "./demo-store"

export type DatabaseProvider =
  | {
      mode: "memory"
      store: RelayStore
    }
  | {
      mode: "supabase"
      client: SupabaseClient
    }

export function createRepositoryProvider(): DatabaseProvider {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (url && serviceRoleKey) {
    return {
      mode: "supabase",
      client: createClient(url, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    }
  }

  return {
    mode: "memory",
    store: getDemoStore()
  }
}
