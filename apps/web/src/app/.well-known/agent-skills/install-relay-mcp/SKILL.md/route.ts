import { getAgentSkillDocument } from "@/server/discovery/agent-skills"

const skill = getAgentSkillDocument("install-relay-mcp")

export async function GET() {
  return new Response(skill?.content ?? "Skill not found.\n", {
    status: skill ? 200 : 404,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300",
    },
  })
}
