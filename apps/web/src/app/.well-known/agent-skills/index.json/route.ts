import { AGENT_SKILL_DOCUMENTS, getAgentSkillDigest } from "@/server/discovery/agent-skills"

const BODY = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: AGENT_SKILL_DOCUMENTS.map((skill) => ({
    name: skill.slug,
    type: "skill-md",
    description: skill.description,
    url: `/.well-known/agent-skills/${skill.slug}/SKILL.md`,
    digest: getAgentSkillDigest(skill.content),
  })),
}

export async function GET() {
  return Response.json(BODY, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300",
    },
  })
}
