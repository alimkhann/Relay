import type { RelayClient } from "../client.js"

interface LatestResponse {
  packet: { content: string } | null
}

export async function readProjectBrief(
  client: RelayClient,
  projectId: string
) {
  const data = await client.get<LatestResponse>(
    `/api/projects/${projectId}/bootstrap/latest?targetProfileKey=claude_code_build&kind=fresh_chat_bootstrap`
  )

  return {
    contents: [
      {
        uri: `relay://project/${projectId}/brief`,
        mimeType: "text/markdown",
        text: data.packet?.content ?? "No brief available for this project."
      }
    ]
  }
}
