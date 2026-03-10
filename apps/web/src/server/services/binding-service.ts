import { createRepositoryBundle } from "@relay/db"
import { bindingInputSchema } from "@relay/shared"

export async function bindProject(userId: string, input: unknown) {
  const repositories = createRepositoryBundle()
  const parsed = bindingInputSchema.parse(input)
  const binding = await repositories.bindings.bind(userId, parsed)

  await repositories.events.log({
    userId,
    projectId: parsed.projectId,
    sessionId: null,
    eventType: "project_bound",
    payload: parsed as Record<string, unknown>
  })

  return binding
}
