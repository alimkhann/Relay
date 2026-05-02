import { generateBootstrapForProject } from "./bootstrap-service"
import { composeContextSchema } from "@relay/shared"

export async function prepareHandoffForProject(userId: string, projectId: string, input: unknown) {
  const parsed = composeContextSchema.parse(input)
  const result = await generateBootstrapForProject(userId, projectId, {
    targetProfileKey: parsed.targetProfileKey,
    kind: "fresh_chat_bootstrap",
    since: parsed.since,
  })

  if (result.status !== "ready" || !result.packet) {
    return {
      packet: null,
      targetProfileKey: parsed.targetProfileKey,
      status: result.status,
      reason: result.reason,
    }
  }

  return {
    packet: result.packet,
    targetProfileKey: parsed.targetProfileKey,
    status: result.status,
    reason: result.reason,
  }
}
