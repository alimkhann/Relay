import { buildOpenApiDocument } from "@/server/discovery/openapi"

export async function GET() {
  return Response.json(buildOpenApiDocument(), {
    headers: {
      "Content-Type": "application/openapi+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300",
    },
  })
}
