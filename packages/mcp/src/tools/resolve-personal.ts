import type { RelayClient } from "../client.js"

interface PersonalProbeResponse {
  projects: Array<{ id: string; kind?: "project" | "personal" }>
}

/**
 * Resolve the literal "personal" projectId alias to the user's kind='personal'
 * project id. Uses its OWN ?includePersonal=true fetch — the default
 * /api/projects (and the cwd auto-detect path) excludes personal, and adding the
 * param there would let personal get auto-selected as the active project.
 * Resolved fresh per call (never cached) to avoid cross-tenant personal-id reuse
 * on a shared HTTP server.
 */
export async function resolvePersonalProjectId(client: RelayClient): Promise<string> {
  const data = await client.get<PersonalProbeResponse>("/api/projects?includePersonal=true")
  const personal = data.projects.find((p) => p.kind === "personal")
  if (!personal) {
    throw new Error("No personal project found for this account.")
  }
  return personal.id
}
