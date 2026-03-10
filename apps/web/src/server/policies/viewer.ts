import { createSupabaseServerClient } from "@relay/db"

export interface Viewer {
  userId: string
  mode: "demo" | "supabase"
}

export async function resolveViewer(token?: string | null): Promise<Viewer> {
  const client = createSupabaseServerClient()

  if (client && token) {
    const { data } = await client.auth.getUser(token)
    if (data.user) {
      return {
        userId: data.user.id,
        mode: "supabase"
      }
    }
  }

  if (process.env.RELAY_ALLOW_DEMO_MODE !== "false") {
    return {
      userId: process.env.RELAY_DEFAULT_USER_ID ?? "demo-user",
      mode: "demo"
    }
  }

  throw new Error("Authentication is required.")
}
