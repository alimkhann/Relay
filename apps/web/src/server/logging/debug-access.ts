import { getAuthServer } from "@/lib/auth/server"

interface DebugViewer {
  id: string
  email: string
}

function getAllowedEmails() {
  return new Set(
    (process.env.RELAY_DEBUG_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  )
}

export async function requireDebugViewer(): Promise<DebugViewer> {
  const auth = getAuthServer()
  const session = auth ? await auth.getSession() : { data: null }
  const user = session.data?.user as { id?: string; email?: string | null } | undefined

  if (!user?.id || !user.email) {
    throw new Error("Debug access requires a signed-in session.")
  }

  const allowedEmails = getAllowedEmails()
  if (!allowedEmails.has(user.email.toLowerCase())) {
    throw new Error("Debug access is not allowed for this account.")
  }

  return {
    id: user.id,
    email: user.email
  }
}
